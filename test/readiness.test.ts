/**
 * Tests for the checker's pure logic. No network: every case is a fixture.
 *
 * The case that matters most is the last one. The whole design rests on an
 * unreadable answer never becoming a safety claim, and nothing else in the
 * repo proves that holds.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { EvmWindow } from '@qorechain/evm'
import type { PqcStatus } from '@qorechain/sdk'
import { normaliseAddress, formatQor, verdictFor, remedyFor } from '../src/readiness.js'

const EVM = '0x9dcd8287446e0dd4d2892f610d047c7f87267a6c'
const QOR = 'qor1nhxc9p6ydcxaf55f9ass6pru07rjv7nvfdal39'

/** A window fixture. Defaults describe a healthy, live window. */
function win(over: Partial<EvmWindow> = {}): EvmWindow {
  return {
    found: true,
    live: true,
    openedHeight: 100n,
    expiryHeight: 700n,
    maxTxs: 5n,
    usedTxs: 1n,
    maxValue: 1000000n,
    usedValue: 0n,
    remainingBlocks: 600n,
    remainingTxs: 4n,
    remainingValue: 1000000n,
    nativeOnly: false,
    allowedTargets: [],
    ...over,
  }
}

const registered: PqcStatus = { registered: true, algorithmId: 5, possessionProven: true }
const unregistered: PqcStatus = { registered: false }

// --- address handling -------------------------------------------------------

test('a 0x address converts to qor1 and back to itself', () => {
  const a = normaliseAddress(EVM)
  assert.ok(a, 'should convert')
  assert.equal(a.qor, QOR)
  assert.equal(a.evm, EVM)
  const back = normaliseAddress(a.qor)
  assert.equal(back?.evm, EVM, 'round trip must land on the same 20 bytes')
})

test('a qor1 address converts to 0x and back to itself', () => {
  const a = normaliseAddress(QOR)
  assert.ok(a)
  assert.equal(a.evm, EVM)
  assert.equal(normaliseAddress(a.evm)?.qor, QOR)
})

test('a 0x address is lowercased, so checksummed input matches', () => {
  const mixed = '0x9DCd8287446e0DD4D2892F610D047c7F87267A6c'
  assert.equal(normaliseAddress(mixed)?.evm, EVM)
  assert.equal(normaliseAddress(mixed)?.qor, QOR)
})

test('an unreadable address yields null rather than throwing', () => {
  assert.equal(normaliseAddress('not-an-address'), null)
  assert.equal(normaliseAddress('0xdeadbeef'), null, 'too short to be 20 bytes')
  assert.equal(normaliseAddress(''), null)
})

// --- uqor formatting --------------------------------------------------------

test('uqor renders as QOR without trailing zeros', () => {
  assert.equal(formatQor(0n), '0')
  assert.equal(formatQor(1000000n), '1')
  assert.equal(formatQor(1500000n), '1.5')
  assert.equal(formatQor(1n), '0.000001', 'the smallest unit must not round away')
  assert.equal(formatQor(123456789n), '123.456789')
})

// --- verdicts ---------------------------------------------------------------

test('registered key and live window is ready', () => {
  const v = verdictFor(registered, win())
  assert.equal(v.state, 'ready')
})

test('no registered key is blocked as no-pqc-key', () => {
  const v = verdictFor(unregistered, win({ found: false, live: false }))
  assert.equal(v.state, 'blocked')
  assert.equal(v.state === 'blocked' && v.reason, 'no-pqc-key')
})

test('a missing key outranks a present window', () => {
  // A window cannot exist without a key, so if the chain ever reports both,
  // the key is the fact worth acting on.
  const v = verdictFor(unregistered, win())
  assert.equal(v.state === 'blocked' && v.reason, 'no-pqc-key')
})

test('registered key with no stored window is no-window', () => {
  const v = verdictFor(registered, win({ found: false, live: false }))
  assert.equal(v.state === 'blocked' && v.reason, 'no-window')
})

test('a stored but not live window is exhausted, not no-window', () => {
  const v = verdictFor(registered, win({ live: false, remainingTxs: 0n, remainingBlocks: 0n }))
  assert.equal(v.state === 'blocked' && v.reason, 'exhausted')
})

test('each blocked reason names a runnable remedy', () => {
  assert.equal(remedyFor('no-pqc-key'), 'npm run window register')
  assert.equal(remedyFor('no-window'), 'npm run window open')
  assert.equal(remedyFor('exhausted'), 'npm run window open')
})

// --- the rule the design rests on ------------------------------------------

test('an unreadable PQC status is unknown, never blocked', () => {
  const v = verdictFor(null, win())
  assert.equal(v.state, 'unknown')
  assert.notEqual(v.state, 'blocked', 'a transport failure must not read as quantum-unsafe')
})

test('an unreadable window status is unknown, not no-window', () => {
  const v = verdictFor(registered, null)
  assert.equal(v.state, 'unknown')
})

test('unknown is never reported for a key that is readably absent', () => {
  // The distinction only exists for unreadable answers. A clear "no" stays a no.
  const v = verdictFor(unregistered, null)
  assert.equal(v.state, 'blocked')
})
