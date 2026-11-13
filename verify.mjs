/**
 * verify.mjs - check a deployed contract and its transactions on chain.
 *
 *   node verify.mjs <contractAddress> [txHash ...]
 *
 * Read-only. Independent of the deploy script: it asks the node directly, so
 * it can confirm what deploy.ts reported rather than repeating its claims.
 */
import { toFunctionSelector } from 'viem'

const [contract, ...hashes] = process.argv.slice(2)
if (!contract?.startsWith('0x')) {
  console.error('Usage: node verify.mjs <contractAddress> [txHash ...]')
  process.exit(1)
}
const RPC = process.env.QORE_EVM_RPC_URL ?? 'https://evm-testnet.qore.host'

const call = (method, params) =>
  fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  }).then((r) => r.json())

console.log(`rpc      ${RPC}`)
console.log(`contract ${contract}`)
console.log('')

const code = await call('eth_getCode', [contract, 'latest'])
const bytes = code.result && code.result !== '0x' ? (code.result.length - 2) / 2 : 0
console.log(`bytecode ${bytes ? bytes + ' bytes' : 'NONE - nothing deployed at this address'}`)

if (bytes) {
  const val = await call('eth_call', [{ to: contract, data: toFunctionSelector('count()') }, 'latest'])
  console.log(`count()  ${val.result ? BigInt(val.result).toString() : val.error?.message ?? 'no answer'}`)
}

for (const h of hashes) {
  const r = await call('eth_getTransactionReceipt', [h])
  const rec = r.result
  if (!rec) {
    console.log(`\n${h}\n  not found`)
    continue
  }
  console.log(`\n${h}`)
  console.log(`  status   ${rec.status} ${rec.status === '0x1' ? '(success)' : '(FAILED)'}`)
  console.log(`  block    ${BigInt(rec.blockNumber)}`)
  console.log(`  gas used ${BigInt(rec.gasUsed)}`)
  if (rec.contractAddress) console.log(`  created  ${rec.contractAddress}`)
}
