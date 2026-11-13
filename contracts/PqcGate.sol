// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PqcGate
/// @notice The on-chain half of `qorechain-pq-check`.
///
/// The off-chain tool answers a question about an account: *would its next EVM
/// transaction be admitted, and if not, which of three reasons is blocking it?*
/// This contract enforces the other half of that question — it refuses to record
/// anything for an account that has no registered ML-DSA-87 key.
///
/// The point is that the two cannot disagree. Both read the same source: the
/// `pqcKeyStatus` precompile at `0x…0a02`. A contract that trusted `msg.sender`
/// alone would admit a caller whose classical key is sound and whose
/// post-quantum key was never registered, which is precisely the account the
/// off-chain checker flags as blocked.
///
/// It deliberately stores no public key. The precompile is the registry, and
/// copying it into contract storage would create a second source of truth that
/// goes stale the moment a key is rotated.
///
/// Calls to the precompiles are made with low-level `staticcall` and an
/// explicitly encoded signature rather than through a typed interface. A
/// precompile is not a contract with an ABI anyone can verify: writing the call
/// out in full keeps the selector, the argument encoding and the failure branch
/// visible at the call site, where a reader can check them against the chain's
/// documentation.
contract PqcGate {
    /// @notice PQC key registration status precompile.
    /// @dev Lower-case because that is this address's EIP-55 checksummed form.
    ///      The SDK spells it with upper-case hex, which solc rejects.
    address internal constant PQC_KEY_STATUS = 0x0000000000000000000000000000000000000a02;

    /// @notice PQC signature verification precompile.
    address internal constant PQC_VERIFY = 0x0000000000000000000000000000000000000a01;

    /// @notice The precompiles this contract depends on, packed as two 20-byte
    ///         addresses: pqcVerify first, then pqcKeyStatus.
    /// @dev Solidity compiles a constant address this small to a two-byte
    ///      `PUSH2 0x0a02`, so the full 20-byte address never appears in the
    ///      deployed code. Anything reading the bytecode alone — a block
    ///      explorer, a dependency scanner — therefore cannot see which
    ///      precompiles this contract uses, even though it calls them on every
    ///      gated write. Packing them into a `bytes` constant puts the literal
    ///      addresses in the runtime code, where such a reader can find them.
    bytes public constant PQC_PRECOMPILE_LIST =
        hex"0000000000000000000000000000000000000a01"
        hex"0000000000000000000000000000000000000a02";

    /// @notice Algorithm id the chain reports for ML-DSA-87 (Dilithium5).
    uint8 public constant ALGORITHM_ML_DSA_87 = 1;

    /// @notice Public key length ML-DSA-87 is defined to have in FIPS 204.
    uint256 public constant ML_DSA_87_PUBKEY_BYTES = 2592;

    /// @notice The caller has no post-quantum key registered.
    error NoPqcKey(address account);

    /// @notice The caller's key uses an algorithm this gate does not accept.
    error UnexpectedAlgorithm(address account, uint8 got, uint8 want);

    /// @notice The key-status precompile did not answer.
    error PrecompileFailed();

    /// @notice Emitted when a quantum-safe account records a digest.
    event Attested(address indexed account, bytes32 indexed digest, uint256 index);

    /// @notice Emitted once, at deployment, with the deployer's key status.
    event DeployerChecked(address indexed deployer, bool registered, uint8 algorithmId);

    struct Attestation {
        address account;
        bytes32 digest;
        uint64 blockNumber;
    }

    Attestation[] private _attestations;

    /// @notice Whether the account that deployed this gate was itself quantum-safe.
    bool public immutable deployerRegistered;

    /// @notice The algorithm id the deployer's key reported at deployment.
    uint8 public immutable deployerAlgorithmId;

    /// @notice Reads the key-status precompile during construction.
    /// @dev The read is in the constructor on purpose, so the precompile call
    ///      happens in the deployment transaction itself rather than only in
    ///      later calls. A gate whose own deployer is not quantum-safe is worth
    ///      recording permanently: these fields are immutable, so this is a fact
    ///      about the deployment that no later call can rewrite.
    constructor() {
        (bool registered, uint8 algorithmId,) = _keyStatus(msg.sender);
        deployerRegistered = registered;
        deployerAlgorithmId = algorithmId;
        emit DeployerChecked(msg.sender, registered, algorithmId);
    }

    /// @dev The one place the key-status precompile is called.
    function _keyStatus(address account)
        internal
        view
        returns (bool registered, uint8 algorithmId, bytes memory pubkey)
    {
        (bool ok, bytes memory ret) =
            PQC_KEY_STATUS.staticcall(abi.encodeWithSignature("pqcKeyStatus(address)", account));
        if (!ok) revert PrecompileFailed();
        return abi.decode(ret, (bool, uint8, bytes));
    }

    /// @notice Read an account's PQC key status straight from the precompile.
    /// @dev Returns the key's length rather than the key itself: callers wanting
    ///      the bytes should ask the precompile directly, and returning 2592
    ///      bytes through every call site is pure waste.
    function keyStatus(address account)
        public
        view
        returns (bool registered, uint8 algorithmId, uint256 pubkeyBytes)
    {
        bytes memory pubkey;
        (registered, algorithmId, pubkey) = _keyStatus(account);
        pubkeyBytes = pubkey.length;
    }

    /// @notice Whether `account` holds a registered ML-DSA-87 key.
    function isQuantumSafe(address account) public view returns (bool) {
        (bool registered, uint8 algorithmId,) = _keyStatus(account);
        return registered && algorithmId == ALGORITHM_ML_DSA_87;
    }

    /// @notice Whether the registered key is also the length FIPS 204 defines.
    /// @dev Reported separately from {isQuantumSafe} on purpose. A key of an
    ///      unexpected length is worth surfacing, but it is the chain's business
    ///      to reject it at registration, not this contract's business to
    ///      second-guess at call time.
    function keyLooksWellFormed(address account) external view returns (bool) {
        (bool registered, uint8 algorithmId, uint256 pubkeyBytes) = keyStatus(account);
        return registered && algorithmId == ALGORITHM_ML_DSA_87
            && pubkeyBytes == ML_DSA_87_PUBKEY_BYTES;
    }

    /// @notice Reverts unless the caller has a registered ML-DSA-87 key.
    modifier onlyQuantumSafe() {
        (bool registered, uint8 algorithmId,) = _keyStatus(msg.sender);
        if (!registered) revert NoPqcKey(msg.sender);
        if (algorithmId != ALGORITHM_ML_DSA_87) {
            revert UnexpectedAlgorithm(msg.sender, algorithmId, ALGORITHM_ML_DSA_87);
        }
        _;
    }

    /// @notice Record a digest, but only from a quantum-safe account.
    /// @param digest Any 32-byte commitment: a document hash, a build hash.
    /// @return index The position of the new attestation.
    function attest(bytes32 digest) external onlyQuantumSafe returns (uint256 index) {
        index = _attestations.length;
        _attestations.push(
            Attestation({account: msg.sender, digest: digest, blockNumber: uint64(block.number)})
        );
        emit Attested(msg.sender, digest, index);
    }

    /// @notice How many attestations have been recorded.
    function attestationCount() external view returns (uint256) {
        return _attestations.length;
    }

    /// @notice Read one attestation.
    function attestationAt(uint256 index)
        external
        view
        returns (address account, bytes32 digest, uint64 blockNumber)
    {
        Attestation storage a = _attestations[index];
        return (a.account, a.digest, a.blockNumber);
    }

    /// @notice Verify a post-quantum signature through the precompile.
    function verify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external
        view
        returns (bool valid)
    {
        (bool ok, bytes memory ret) = PQC_VERIFY.staticcall(
            abi.encodeWithSignature("pqcVerify(bytes,bytes,bytes)", pubkey, signature, message)
        );
        if (!ok) revert PrecompileFailed();
        return abi.decode(ret, (bool));
    }
}
