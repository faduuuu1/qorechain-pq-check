/**
 * deploy-gate.ts - deploy PqcGate to the QoreChain EVM Engine and exercise the
 * PQC key-status precompile through it.
 *
 *   npm run deploy:gate
 *
 * What it does, in order:
 *   1. deploys contracts/PqcGate.sol
 *   2. calls keyStatus(deployer) - a contract call that reaches the precompile
 *      at 0x…0a02, rather than the off-chain REST read scripts/check.ts does
 *   3. calls attest(digest), which the contract refuses unless the caller has a
 *      registered ML-DSA-87 key
 *
 * Step 3 is the part worth watching. If the gate is working, an account without
 * a registered key cannot get past it, and the revert names which of the two
 * reasons applied.
 *
 * Signer: the SAME account `npm run window` uses, or the deploy lands on an
 * account with no authorisation window and is refused. See scripts/deploy.ts.
 *
 * Requirements: QORE_EVM_RPC_URL reachable, and a live EVM window for the
 * signing account (`npm run window open`).
 */
import {
  createEvmClient,
  deployContract,
  evmAccountFromPrivateKey,
  readContract,
  writeContract,
} from "@qorechain/evm";
import { mnemonicToAccount } from "viem/accounts";
import { keccak256, toHex } from "viem";
import type { Address, Hex } from "viem";

import { pqcGateAbi, pqcGateBytecode } from "../contracts/PqcGate.artifact.js";

const PLACEHOLDER_KEY = `0x${"0".repeat(64)}`;

/** Resolved exactly as scripts/deploy.ts resolves it, so the two cannot drift. */
function resolveAccount() {
  const mnemonic = process.env.QORE_MNEMONIC?.trim();
  if (mnemonic) return mnemonicToAccount(mnemonic);

  const key = process.env.QORE_EVM_PRIVATE_KEY?.trim();
  if (!key || key.toLowerCase() === PLACEHOLDER_KEY) {
    throw new Error(
      "No signer configured. Set QORE_MNEMONIC in .env - the same value " +
        "`npm run window` uses - or set QORE_EVM_PRIVATE_KEY to a real key.",
    );
  }
  return evmAccountFromPrivateKey(key as Hex);
}

async function main(): Promise<void> {
  const evmRpc = process.env.QORE_EVM_RPC_URL ?? "http://localhost:8545";

  const client = await createEvmClient({ endpoints: { evmRpc } });
  const account = resolveAccount();
  const wallet = client.getWalletClient(account);

  console.log(`network:  QoreChain EVM (chain id ${await client.getChainId()})`);
  console.log(`deployer: ${account.address}`);

  // 1. Deploy.
  console.log("\nDeploying PqcGate…");
  const deployHash = await deployContract(wallet, {
    abi: pqcGateAbi,
    bytecode: pqcGateBytecode,
    args: [],
  });
  const receipt = await client.publicClient.waitForTransactionReceipt({ hash: deployHash });
  const contract = receipt.contractAddress;
  if (!contract) throw new Error("Deployment receipt did not include a contract address.");

  console.log(`deployed: ${contract}`);
  console.log(`block:    ${receipt.blockNumber}`);

  // 2. Read the precompile through the contract.
  // readContract is typed to `unknown` for tuple returns, so the shape is named
  // here. It mirrors IQorePQC.pqcKeyStatus: (registered, algorithmId, length).
  const [registered, algorithmId, pubkeyBytes] = (await readContract(client.publicClient, {
    address: contract as Address,
    abi: pqcGateAbi,
    functionName: "keyStatus",
    args: [account.address],
  })) as readonly [boolean, number, bigint];
  const wellFormed = await readContract(client.publicClient, {
    address: contract as Address,
    abi: pqcGateAbi,
    functionName: "keyLooksWellFormed",
    args: [account.address],
  });

  console.log("\n--- pqcKeyStatus, read through the contract ---");
  console.log(`registered     : ${registered}`);
  console.log(`algorithm id   : ${algorithmId}${algorithmId === 1 ? " (ML-DSA-87)" : ""}`);
  console.log(`public key     : ${pubkeyBytes} bytes`);
  console.log(`FIPS 204 length: ${wellFormed ? "yes" : "no"} (expected 2592)`);

  // 3. Pass through the gate.
  const digest = keccak256(toHex(`qorechain-pq-check @ ${new Date().toISOString()}`));
  console.log(`\nCalling attest(${digest.slice(0, 18)}…)…`);
  const attestHash = await writeContract(wallet, {
    address: contract as Address,
    abi: pqcGateAbi,
    functionName: "attest",
    args: [digest],
    account: wallet.account ?? null,
    chain: wallet.chain,
  });
  await client.publicClient.waitForTransactionReceipt({ hash: attestHash });

  const count = await readContract(client.publicClient, {
    address: contract as Address,
    abi: pqcGateAbi,
    functionName: "attestationCount",
  });
  console.log(`attested: tx ${attestHash}`);
  console.log(`count:    ${count}`);

  console.log("\n============================================================");
  console.log("DEPLOYMENT TRANSACTION (paste this into the Ship Weeks badge")
  console.log('"First contract with a PQC check" on build.qorechain.io/me):');
  console.log(`\n  ${deployHash}\n`);
  console.log("============================================================");
}

main().catch((err: unknown) => {
  console.error("\nDeploy failed.");
  console.error(
    "Check QORE_EVM_RPC_URL is reachable, that QORE_MNEMONIC is set, and that " +
      "the account has a live window (npm run window status).",
  );
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
