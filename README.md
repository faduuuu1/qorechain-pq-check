# qorechain-pq-check

A post-quantum readiness checker for QoreChain accounts, built for the
**Build Before Q-Day** developer fest (Quantum Pass category).

It answers one question per account: *if this account sent an EVM transaction
right now, would the chain admit it, and if not, why not?*

```
npm run check -- 0x9DCd8287446e0DD4D2892F610D047c7F87267A6c
```

```
QoreChain post-quantum readiness check
==============================================================================
network   testnet (qorechain-diana)
rest      https://api-testnet.qore.host
reads only - no private key, no gas, no funded account

------------------------------------------------------------------------------
qor1nhxc9p6ydcxaf55f9ass6pru07rjv7nvfdal39
  0x9dcd8287446e0dd4d2892f610d047c7f87267a6c

  post-quantum key        NOT registered
  evm window              none stored

  VERDICT  an EVM transaction would be refused (no-pqc-key)
           the account has no registered ML-DSA-87 key, so no window can be opened at all
           remedy: npm run window register
------------------------------------------------------------------------------
1 checked: 0 ready, 1 blocked, 0 unknown
```

## Why this is worth a tool

QoreChain does not admit an EVM transaction on the strength of its secp256k1
signature alone. It needs **two** things, and they fail independently:

1. a registered **ML-DSA-87** (Dilithium-5) key for the sending account, and
2. a **live EVM authorisation window**, opened by a native-lane message signed
   hybrid (secp256k1 + ML-DSA-87).

A deploy that reverts with nothing useful is usually one of: no key, no window,
or a window that is stored but spent. Those are three different problems with
three different remedies, and the EVM lane does not tell them apart for you.
This tool does, and it names the remedy.

Both facts are readable over REST, so the whole check needs **no private key,
no gas and no funded account**. Point it at any address.

## Unknown is not "no"

`fetchPqcStatus` throws when the chain's answer cannot be read, rather than
reporting an unregistered key. This tool keeps that distinction: an account
whose status could not be read prints `UNKNOWN`, never "not registered".

Calling an account quantum-unsafe because of a transport failure would be worse
than saying nothing at all, so the summary line counts `unknown` separately
from `blocked`.

## Usage

```sh
npm install
npm run check -- <qor1... | 0x...> [more addresses] [--network testnet|mainnet]
```

Either address form is accepted. A `0x` address is eth-native on QoreChain -
the same 20 bytes - so the tool converts it with `toQorAddress` and prints both.

| Verdict | Meaning | Remedy |
| --- | --- | --- |
| `ready` | key registered, window live | none |
| `no-pqc-key` | no ML-DSA-87 key; no window can be opened at all | `npm run window register` |
| `no-window` | key registered, no window opened | `npm run window open` |
| `exhausted` | window stored but out of txs, value or blocks | `npm run window open` |
| `UNKNOWN` | the chain's answer could not be read | retry; not a safety claim |

## The other scripts

- `npm run window status | register | open | recovery-code` - inspect and open
  the account's EVM authorisation window. Needs credentials.
- `npm run deploy` - deploy the `Counter` contract. Needs a funded account and
  a live window.

## Tests

```sh
npm test        # 14 tests, no network
npm run typecheck
```

The verdict logic and address handling live in `src/readiness.ts`, apart from
the script, so they can be tested without touching the chain. The suite uses
Node 24's built-in runner and adds no dependency.

It covers both address directions and the round trip, checksummed input, uqor
formatting down to the smallest unit, and every verdict state. Three cases
exist for the rule the design rests on: an unreadable PQC status is `unknown`
and never `blocked`, an unreadable window status is `unknown` and not
`no-window`, and a key that is *readably* absent still reports `blocked` -
the distinction applies to unreadable answers, not to a clear no.

One ordering case is deliberate: a missing key outranks a present window,
because a window cannot exist without a key, so the key is the fact worth
acting on.

## Built with

- [`create-qorechain-dapp`](https://www.npmjs.com/package/create-qorechain-dapp) 0.14.0, `evm-solidity` template, testnet preset
- `@qorechain/sdk` 0.14.0 - `fetchPqcStatus`
- `@qorechain/evm` 0.14.0 - `evmWindowStatus`, `toQorAddress`, `toEvmAddress`
- viem, tsx, TypeScript 5, Node.js 24
