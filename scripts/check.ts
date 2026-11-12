/**
 * check.ts - post-quantum readiness checker for QoreChain accounts.
 *
 *   npm run check -- qor1... [0x... ...] [--network testnet|mainnet]
 *
 * Answers one question per account: if this account sent an EVM transaction
 * right now, would the chain admit it, and if not, why not?
 *
 * On QoreChain an EVM transaction needs BOTH
 *   1. a registered ML-DSA-87 (Dilithium-5) key for the account, and
 *   2. a live EVM authorisation window opened by a hybrid-signed native message.
 * Either one missing and the transaction is refused. Both are readable over
 * REST, so this whole tool needs no private key, no gas and no funded account.
 *
 * UNKNOWN IS NOT "NO". fetchPqcStatus throws when the chain's answer cannot be
 * read, rather than reporting an unregistered key. This tool keeps that
 * distinction: an account whose status could not be read prints UNKNOWN, never
 * "not registered". Reporting a quantum-unsafe verdict on a transport failure
 * would be worse than reporting nothing.
 */
import { fetchPqcStatus, type PqcStatus } from '@qorechain/sdk'
import { evmWindowStatus, toQorAddress, toEvmAddress, type EvmWindow } from '@qorechain/evm'

const NETWORKS = {
  testnet: { chainId: 'qorechain-diana', rest: 'https://api-testnet.qore.host' },
  mainnet: { chainId: 'qorechain-vladi', rest: 'https://api.qore.host' },
} as const
type NetworkName = keyof typeof NETWORKS

const argv = process.argv.slice(2)
let networkName: NetworkName = (process.env.QORE_NETWORK as NetworkName) ?? 'testnet'
const addresses: string[] = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--network' || argv[i] === '-n') {
    networkName = argv[++i] as NetworkName
  } else {
    addresses.push(argv[i])
  }
}
const net = NETWORKS[networkName]
if (!net) {
  console.error(`Unknown network "${networkName}". Use testnet or mainnet.`)
  process.exit(1)
}
if (addresses.length === 0) {
  console.error('Usage: npm run check -- <qor1... | 0x...> [more addresses] [--network testnet|mainnet]')
  process.exit(1)
}

/** Accept either form and return both. A 0x address is eth-native: same 20 bytes. */
function normalise(input: string): { qor: string; evm: string } | null {
  try {
    if (input.startsWith('0x')) return { qor: toQorAddress(input), evm: input.toLowerCase() }
    return { qor: input, evm: toEvmAddress(input) }
  } catch {
    return null
  }
}

function pad(s: unknown, n: number, right = false) {
  let t = String(s)
  if (t.length > n) t = t.slice(0, n - 1) + '~'
  return right ? t.padStart(n) : t.padEnd(n)
}

/** uqor -> QOR, for readability only. */
function qor(uqor: bigint): string {
  const whole = uqor / 1000000n
  const frac = (uqor % 1000000n).toString().padStart(6, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : `${whole}`
}

type Verdict =
  | { state: 'ready'; why: string }
  | { state: 'blocked'; reason: 'no-pqc-key' | 'no-window' | 'exhausted'; why: string }
  | { state: 'unknown'; why: string }

function verdictFor(pqc: PqcStatus | null, win: EvmWindow | null): Verdict {
  if (pqc === null) return { state: 'unknown', why: 'the PQC status could not be read' }
  if (!pqc.registered) {
    return {
      state: 'blocked',
      reason: 'no-pqc-key',
      why: 'the account has no registered ML-DSA-87 key, so no window can be opened at all',
    }
  }
  if (win === null) return { state: 'unknown', why: 'the window status could not be read' }
  if (!win.found) {
    return { state: 'blocked', reason: 'no-window', why: 'the key is registered but no window has been opened' }
  }
  if (!win.live) {
    return {
      state: 'blocked',
      reason: 'exhausted',
      why: `the window is stored but spent: ${win.remainingTxs} txs and ${win.remainingBlocks} blocks left`,
    }
  }
  return {
    state: 'ready',
    why: `window live, ${win.remainingTxs} txs and ${win.remainingBlocks} blocks remaining`,
  }
}

console.log('QoreChain post-quantum readiness check')
console.log('='.repeat(78))
console.log(`network   ${networkName} (${net.chainId})`)
console.log(`rest      ${net.rest}`)
console.log(`read at   ${new Date().toISOString()}`)
console.log('reads only - no private key, no gas, no funded account')
console.log('')

let ready = 0
let blocked = 0
let unknown = 0

for (const input of addresses) {
  const a = normalise(input)
  console.log('-'.repeat(78))
  if (!a) {
    console.log(`${input}\n  not a readable qor1 or 0x address, skipped`)
    unknown++
    continue
  }
  console.log(`${a.qor}`)
  console.log(`${pad('', 2)}${a.evm}`)

  let pqc: PqcStatus | null = null
  let pqcErr = ''
  try {
    pqc = await fetchPqcStatus({ rest: net.rest, address: a.qor })
  } catch (err: any) {
    pqcErr = err?.shortMessage ?? err?.message ?? String(err)
  }

  let win: EvmWindow | null = null
  let winErr = ''
  try {
    win = await evmWindowStatus({ rest: net.rest, address: a.qor })
  } catch (err: any) {
    winErr = err?.shortMessage ?? err?.message ?? String(err)
  }

  console.log('')
  console.log(`  ${pad('post-quantum key', 24)}${
    pqc === null ? `UNKNOWN (${pqcErr})` : pqc.registered ? 'registered' : 'NOT registered'
  }`)
  if (pqc?.registered) {
    console.log(`  ${pad('algorithm id', 24)}${pqc.algorithmId ?? 'not reported'}`)
    console.log(
      `  ${pad('possession proven', 24)}${
        pqc.possessionProven === undefined ? 'not reported (node below v3.2.4)' : pqc.possessionProven
      }`,
    )
  }

  if (win === null) {
    console.log(`  ${pad('evm window', 24)}UNKNOWN (${winErr})`)
  } else if (!win.found) {
    console.log(`  ${pad('evm window', 24)}none stored`)
  } else {
    console.log(`  ${pad('evm window', 24)}${win.live ? 'live' : 'stored but not live'}`)
    console.log(`  ${pad('  opened / expires', 24)}${win.openedHeight} -> ${win.expiryHeight}`)
    console.log(`  ${pad('  txs used / max', 24)}${win.usedTxs} / ${win.maxTxs}  (${win.remainingTxs} left)`)
    console.log(`  ${pad('  value used / max', 24)}${qor(win.usedValue)} / ${qor(win.maxValue)} QOR`)
    console.log(`  ${pad('  blocks remaining', 24)}${win.remainingBlocks}`)
  }

  const v = verdictFor(pqc, win)
  console.log('')
  if (v.state === 'ready') {
    ready++
    console.log(`  VERDICT  an EVM transaction would be admitted - ${v.why}`)
  } else if (v.state === 'blocked') {
    blocked++
    console.log(`  VERDICT  an EVM transaction would be refused (${v.reason})`)
    console.log(`           ${v.why}`)
    if (v.reason === 'no-pqc-key') console.log(`           remedy: npm run window register`)
    else console.log(`           remedy: npm run window open`)
  } else {
    unknown++
    console.log(`  VERDICT  UNKNOWN - ${v.why}`)
    console.log(`           not reported as unsafe: an unreadable answer is not a "no"`)
  }
}

console.log('-'.repeat(78))
console.log(`${addresses.length} checked: ${ready} ready, ${blocked} blocked, ${unknown} unknown`)
