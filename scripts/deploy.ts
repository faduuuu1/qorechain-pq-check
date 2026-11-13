/**
 * deploy.ts - deploy the Counter contract to the QoreChain EVM Engine and
 * exercise it: read the initial count, increment it, and read it back.
 *
 * Uses @qorechain/evm:
 *   - createEvmClient({ endpoints })  → a viem-backed client (chain id auto-detected)
 *   - deployContract(walletClient, …) → deploy and get the tx hash
 *   - readContract / writeContract    → typed reads and writes
 *
 * Signer (see README): the SAME account `npm run window` uses, or the deploy
 * lands on an account with no authorisation window and is refused.
 *
 *   QORE_MNEMONIC          preferred. Derived at m/44'/60'/0'/0/0, which is what
 *                          window.ts uses, so the two cannot drift apart.
 *   QORE_EVM_PRIVATE_KEY   used only when no mnemonic is set.
 *
 * The scaffolder ships QORE_EVM_PRIVATE_KEY as 64 zeros. That is a placeholder,
 * not a key, and it is rejected here with a message that says so rather than
 * viem's "expected valid private key … got 0".
 *
 * Requirements: QORE_EVM_RPC_URL pointing at a reachable QoreChain EVM
 * JSON-RPC endpoint, and a live EVM window for the signing account
 * (`npm run window open`).
 */
import {
  createEvmClient,
  deployContract,
  evmAccountFromPrivateKey,
  readContract,
  writeContract,
} from "@qorechain/evm";
import { mnemonicToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";

import { counterAbi, counterBytecode } from "../contracts/Counter.artifact.js";

const PLACEHOLDER_KEY = `0x${"0".repeat(64)}`;

/**
 * The signing account, resolved the same way window.ts resolves it: mnemonic
 * first, private key second. viem's mnemonicToAccount defaults to
 * m/44'/60'/0'/0/0, the path window.ts derives, so both scripts sign as the
 * same address.
 */
function resolveAccount() {
  const mnemonic = process.env.QORE_MNEMONIC?.trim();
  if (mnemonic) return mnemonicToAccount(mnemonic);

  const key = process.env.QORE_EVM_PRIVATE_KEY?.trim();
  if (!key || key.toLowerCase() === PLACEHOLDER_KEY) {
    throw new Error(
      "No signer configured. Set QORE_MNEMONIC in .env - the same value " +
        "`npm run window` uses - or set QORE_EVM_PRIVATE_KEY to a real key. " +
        "The scaffolder ships QORE_EVM_PRIVATE_KEY as 64 zeros, which is a " +
        "placeholder rather than a key.",
    );
  }
  return evmAccountFromPrivateKey(key as Hex);
}

async function main(): Promise<void> {
  const evmRpc = process.env.QORE_EVM_RPC_URL ?? "http://localhost:8545";
  const initialCount = BigInt(process.env.QORE_COUNTER_INITIAL ?? "0");

  const client = await createEvmClient({ endpoints: { evmRpc } });
  const account = resolveAccount();
  const wallet = client.getWalletClient(account);

  console.log(`network:  QoreChain EVM (chain id ${await client.getChainId()})`);
  console.log(`deployer: ${account.address}`);
  console.log(
    `signer:   ${process.env.QORE_MNEMONIC?.trim() ? "QORE_MNEMONIC (m/44'/60'/0'/0/0)" : "QORE_EVM_PRIVATE_KEY"}`,
  );

  // Deploy.
  console.log(`\nDeploying Counter(initial=${initialCount})…`);
  const deployHash = await deployContract(wallet, {
    abi: counterAbi,
    bytecode: counterBytecode,
    args: [initialCount],
  });
  const receipt = await client.publicClient.waitForTransactionReceipt({
    hash: deployHash,
  });
  const contract = receipt.contractAddress;
  if (!contract) {
    throw new Error("Deployment receipt did not include a contract address.");
  }
  console.log(`deployed: ${contract}`);
  console.log(`tx:       ${deployHash}`);

  // Read.
  const before = await readContract(client.publicClient, {
    address: contract as Address,
    abi: counterAbi,
    functionName: "count",
  });
  console.log(`count (before): ${before}`);

  // Write: increment. `account` and `chain` come from the wallet client; we pass
  // them explicitly so the call type-checks against viem's strict signature.
  console.log("\nCalling increment()…");
  const incHash = await writeContract(wallet, {
    address: contract as Address,
    abi: counterAbi,
    functionName: "increment",
    account: wallet.account ?? null,
    chain: wallet.chain,
  });
  await client.publicClient.waitForTransactionReceipt({ hash: incHash });
  console.log(`tx:       ${incHash}`);

  // Read again.
  const after = await readContract(client.publicClient, {
    address: contract as Address,
    abi: counterAbi,
    functionName: "count",
  });
  console.log(`count (after):  ${after}`);
  console.log("\nDone.");
}

main().catch((err: unknown) => {
  console.error("\nDeploy failed.");
  console.error(
    "Check QORE_EVM_RPC_URL is reachable, that QORE_MNEMONIC or " +
      "QORE_EVM_PRIVATE_KEY is set, and that the account has a live window " +
      "(npm run window status).",
  );
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
