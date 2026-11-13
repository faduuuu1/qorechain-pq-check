/**
 * readiness.ts - the pure logic behind the checker, kept apart from the script
 * so it can be tested without touching the network.
 *
 * Nothing here performs I/O. `scripts/check.ts` does the REST reads and hands
 * the results to `verdictFor`.
 */
import { toQorAddress, toEvmAddress, type EvmWindow } from '@qorechain/evm'
import type { PqcStatus } from '@qorechain/sdk'

/** Why an EVM transaction would be refused. Mirrors the SDK's own taxonomy. */
export type BlockedReason = 'no-pqc-key' | 'no-window' | 'exhausted'

export type Verdict =
  | { state: 'ready'; why: string }
  | { state: 'blocked'; reason: BlockedReason; why: string }
  | { state: 'unknown'; why: string }

/**
 * Accept either address form and return both.
 *
 * A `0x` address is eth-native on QoreChain - the same 20 bytes - so the two
 * forms name one account. Returns null for anything that does not convert.
 */
export function normaliseAddress(input: string): { qor: string; evm: string } | null {
  try {
    if (input.startsWith('0x')) return { qor: toQorAddress(input), evm: input.toLowerCase() }
    return { qor: input, evm: toEvmAddress(input) }
  } catch {
    return null
  }
}

/** uqor -> QOR, for readability only. 1 QOR = 1e6 uqor. */
export function formatQor(uqor: bigint): string {
  const whole = uqor / 1000000n
  const frac = (uqor % 1000000n).toString().padStart(6, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : `${whole}`
}

/**
 * Decide whether an EVM transaction from this account would be admitted.
 *
 * `null` means the fact could not be read. It is reported as `unknown`, never
 * as a failure: an unreadable answer is not evidence that an account is
 * quantum-unsafe, and `fetchPqcStatus` throws precisely so the two cannot be
 * confused.
 *
 * Order matters. Without a registered key no window can exist at all, so the
 * key is checked first and a missing window is only meaningful after it.
 */
export function verdictFor(pqc: PqcStatus | null, win: EvmWindow | null): Verdict {
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

/** The remedy for a blocked account, as a runnable command. */
export function remedyFor(reason: BlockedReason): string {
  return reason === 'no-pqc-key' ? 'npm run window register' : 'npm run window open'
}
