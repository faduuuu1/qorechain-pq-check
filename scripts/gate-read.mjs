/**
 * gate-read.mjs - read the deployed PqcGate, and through it the PQC key-status
 * precompile.
 *
 *   node scripts/gate-read.mjs <gateAddress> <qor1... | 0x...>
 *
 * Read-only: eth_call against a public RPC. No key, no gas, no window, nothing
 * signed. The point is that the answer comes back through the contract, so what
 * you see is what the chain would tell the contract at call time, not what an
 * off-chain REST read reports separately.
 */
import { toEvmAddress } from "@qorechain/evm";
import { decodeFunctionResult, encodeFunctionData } from "viem";

const RPC = process.env.QORE_EVM_RPC_URL ?? "https://evm-testnet.qore.host";

const ABI = [
  {
    type: "function", name: "keyStatus", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      { name: "registered", type: "bool" },
      { name: "algorithmId", type: "uint8" },
      { name: "pubkeyBytes", type: "uint256" },
    ],
  },
  {
    type: "function", name: "keyLooksWellFormed", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function", name: "deployerRegistered", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function", name: "deployerAlgorithmId", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function", name: "PQC_KEY_STATUS", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function", name: "attestationCount", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }],
  },
];

const [gate, who] = process.argv.slice(2);
if (!gate || !who) {
  console.error("Usage: node scripts/gate-read.mjs <gateAddress> <address>");
  process.exit(1);
}
const account = who.startsWith("qor1") ? toEvmAddress(who) : who;

async function read(functionName, args = []) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "eth_call",
      params: [{ to: gate, data: encodeFunctionData({ abi: ABI, functionName, args }) }, "latest"],
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${functionName}: ${json.error.message}`);
  return decodeFunctionResult({ abi: ABI, functionName, data: json.result });
}

const pad = (s, n) => String(s).padEnd(n);

const precompile = await read("PQC_KEY_STATUS");
const [registered, algorithmId, pubkeyBytes] = await read("keyStatus", [account]);
const wellFormed = await read("keyLooksWellFormed", [account]);
const deployerOk = await read("deployerRegistered");
const deployerAlg = await read("deployerAlgorithmId");
const attestations = await read("attestationCount");

console.log(`contract    ${gate}`);
console.log(`precompile  ${precompile}   (read from the contract, not hardcoded here)`);
console.log(`account     ${who}`);
console.log(`            ${account}`);
console.log("");
console.log("  read through the contract:");
console.log(`    ${pad("registered", 22)}${registered}`);
console.log(`    ${pad("algorithm id", 22)}${algorithmId}${algorithmId === 1 ? "  (ML-DSA-87)" : ""}`);
console.log(`    ${pad("public key", 22)}${pubkeyBytes} bytes`);
console.log(`    ${pad("FIPS 204 length", 22)}${wellFormed ? "yes" : "no"}  (expected 2592)`);
console.log("");
console.log("  recorded at deployment, immutable:");
console.log(`    ${pad("deployer was ready", 22)}${deployerOk}`);
console.log(`    ${pad("deployer algorithm", 22)}${deployerAlg}${deployerAlg === 1 ? "  (ML-DSA-87)" : ""}`);
console.log("");
console.log(`  attestations recorded through the gate: ${attestations}`);
