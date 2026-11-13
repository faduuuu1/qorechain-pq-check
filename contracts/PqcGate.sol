// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The QoreChain PQC precompiles, as exposed to the EVM lane.
/// @dev Shapes taken from the SDK's IQORE_PQC_ABI (0.14.0), not guessed.
interface IQorePQC {
    /// @notice Registration state of an account's post-quantum key.
    /// @param account The EVM-lane address to look up.
    /// @return registered  Whether the account has a PQC key registered on chain.
    /// @return algorithmId The algorithm identifier; 1 is ML-DSA-87 (Dilithium5).
    /// @return pubkey      The registered public key, empty when not registered.
    function pqcKeyStatus(address account)
        external
        view
        returns (bool registered, uint8 algorithmId, bytes memory pubkey);

    /// @notice Verify a post-quantum signature.
    function pqcVerify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external
        view
        returns (bool valid);
}

/// @title PqcGate
/// @notice The on-chain half of `qorechain-pq-check`.
///
/// The off-chain tool answers a question about an account: *would its next EVM
/// transaction be admitted, and if not, which of three reasons is blocking it?*
/// This contract enforces the other half of that question — it refuses to record
/// anything for an account that has no registered ML-DSA-87 key.
///
/// The point is that the two cannot disagree. Both read the same source: the
/// `pqcKeyStatus` precompile at `0x…0A02`. A contract that trusted `msg.sender`
/// alone would admit a caller whose classical key is sound and whose
/// post-quantum key was never registered, which is precisely the account the
/// off-chain checker flags as blocked.
///
/// It deliberately stores no public key. The precompile is the registry; copying
/// it into contract storage would create a second source of truth that goes
/// stale the moment a key is rotated.
contract PqcGate {
    /// @notice PQC key registration status precompile.
    /// @dev Lower-case because that is this address's EIP-55 checksummed form.
    ///      The SDK spells it with upper-case hex, which solc rejects.
    address public constant PQC_KEY_STATUS = 0x0000000000000000000000000000000000000a02;

    /// @notice PQC signature verification precompile.
    address public constant PQC_VERIFY = 0x0000000000000000000000000000000000000a01;

    /// @notice Algorithm id the chain reports for ML-DSA-87 (Dilithium5).
    uint8 public constant ALGORITHM_ML_DSA_87 = 1;

    /// @notice Public key length ML-DSA-87 is defined to have in FIPS 204.
    /// @dev Used only by {keyLooksWellFormed}; the gate itself does not depend
    ///      on it, so a future encoding change cannot lock callers out.
    uint256 public constant ML_DSA_87_PUBKEY_BYTES = 2592;

    /// @notice The caller has no post-quantum key registered.
    error NoPqcKey(address account);

    /// @notice The caller's key uses an algorithm this gate does not accept.
    error UnexpectedAlgorithm(address account, uint8 got, uint8 want);

    /// @notice Emitted when a quantum-safe account records a digest.
    event Attested(address indexed account, bytes32 indexed digest, uint256 index);

    struct Attestation {
        address account;
        bytes32 digest;
        uint64 blockNumber;
    }

    Attestation[] private _attestations;

    /// @notice Read an account's PQC key status straight from the precompile.
    /// @dev Returns the key's length rather than the key itself: callers that
    ///      want the bytes should ask the precompile directly, and returning
    ///      2592 bytes through every call site is pure waste.
    function keyStatus(address account)
        public
        view
        returns (bool registered, uint8 algorithmId, uint256 pubkeyBytes)
    {
        bytes memory pubkey;
        (registered, algorithmId, pubkey) = IQorePQC(PQC_KEY_STATUS).pqcKeyStatus(account);
        pubkeyBytes = pubkey.length;
    }

    /// @notice Whether `account` holds a registered ML-DSA-87 key.
    function isQuantumSafe(address account) public view returns (bool) {
        (bool registered, uint8 algorithmId,) = IQorePQC(PQC_KEY_STATUS).pqcKeyStatus(account);
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
        (bool registered, uint8 algorithmId,) = IQorePQC(PQC_KEY_STATUS).pqcKeyStatus(msg.sender);
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
    /// @dev A thin pass-through, so a caller already holding this contract's
    ///      address does not need the precompile address too.
    function verify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external
        view
        returns (bool valid)
    {
        return IQorePQC(PQC_VERIFY).pqcVerify(pubkey, signature, message);
    }
}
