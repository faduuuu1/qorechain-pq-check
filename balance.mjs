/**
 * balance.mjs - what an account holds on both QoreChain lanes.
 *
 *   node balance.mjs qor1...
 *
 * Read-only: no key, no signing. The native lane is read over the Cosmos REST
 * API and the EVM lane over JSON-RPC, because an account holds one balance
 * that both lanes see and it is worth confirming they agree.
 */
import { toEvmAddress } from '@qorechain/evm'

const qor = process.argv[2]
if (!qor || !qor.startsWith('qor1')) {
  console.error('Usage: node balance.mjs <qor1...>')
  process.exit(1)
}
const evm = toEvmAddress(qor)

const REST = process.env.QORE_REST_URL ?? 'https://api-testnet.qore.host'
const EVM_RPC = process.env.QORE_EVM_RPC_URL ?? 'https://evm-testnet.qore.host'

console.log(`account  ${qor}`)
console.log(`         ${evm}`)
console.log('')

const bank = await fetch(`${REST}/cosmos/bank/v1beta1/balances/${qor}`, {
  signal: AbortSignal.timeout(15000),
}).then((r) => r.json())

console.log('native lane (cosmos bank)')
if (!bank.balances?.length) {
  console.log('  (no balances)')
} else {
  for (const b of bank.balances) {
    const label = b.denom === 'uqor' ? `${Number(b.amount) / 1e6} QOR` : b.amount
    console.log(`  ${b.denom.padEnd(46)} ${label}`)
  }
}

const rpc = await fetch(EVM_RPC, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [evm, 'latest'] }),
  signal: AbortSignal.timeout(15000),
}).then((r) => r.json())

console.log('')
console.log('evm lane')
if (rpc.result) {
  const wei = BigInt(rpc.result)
  console.log(`  ${wei} wei  =  ${Number(wei) / 1e18} QOR`)
} else {
  console.log(`  ${JSON.stringify(rpc).slice(0, 120)}`)
}
