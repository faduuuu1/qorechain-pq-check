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
- `npm run deploy` - deploy the `Counter` contract. Signs with `QORE_MNEMONIC`
  when set, falling back to `QORE_EVM_PRIVATE_KEY`, so it is always the same
  account `window` opened the window for. Needs a funded account and a live
  window.

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

## Deployed on testnet

Built for **Build Before Q-Day**, the QoreChain Developer Fest, in the
**Quantum Pass** category. The account and contract this project uses on
QoreChain testnet (`qorechain-diana`, EVM chain id 9800):

| | |
| --- | --- |
| Account (native) | `qor1ketzqqfqda7weuz2aj84fapgcjurqer6k0stcg` |
| Account (EVM) | `0xb6562001206F7cECF04aEc8f54F428c4b830647A` |
| Counter contract | `0xfe890d6599dc38949e3ebb40e06fdacb4f7584c1` |

Proof the account works end to end, all mined with `status: 0x1`:

```
window open   hybrid-signed, secp256k1 + ML-DSA-87 (native lane)
              4EF4E503D381D7EB33BEE54EA7B83E9E97077BAEF6398114E925364AA1FE04AD

deploy        block 9988267, gas 138851
              0xae7e346dfa0e8e123a7f50c9c65548ac408d15c4aa7f533787047ca89593bedc

increment     block 9988268, gas 44587
              0x7c09eff1b64c89e38fe0d209d45154198a74b04d23aff253b86241104e77afe0
```

`count()` reads `1` on chain, and the window reports 2 of its 5 transactions
consumed — the same two writes, seen from the other lane.

Running `npm run check -- qor1ketzqqfqda7weuz2aj84fapgcjurqer6k0stcg` against
this account walked through all three verdicts as it was set up:

```
no-pqc-key  ->  no-window  ->  ready
```

## Recording the demo

```bash
npm run demo            # the whole walkthrough, captioned and paced (~88s)
npm run demo -- --fast  # no pauses, for rehearsing
```

Everything it runs is read-only: nothing signed, nothing broadcast, no window
consumed, and `.env` is never printed. `QORE_DEMO_PAUSE` sets how long each
caption holds. See [submission/video-script.md](submission/video-script.md).

## On-chain: the PQC gate

`contracts/PqcGate.sol` is the on-chain half of the same question. The checker
asks, off chain, whether an account's next EVM transaction would be admitted;
the gate refuses, on chain, to record anything for an account with no registered
ML-DSA-87 key. Both read the same precompile at `0x…0a02`, so the two cannot
disagree.

```bash
npm run compile -- PqcGate   # solc 0.8.24 -> contracts/PqcGate.artifact.ts
npm run deploy:gate          # deploy, read the precompile, pass the gate
```

`deploy:gate` needs the same live EVM window a normal deploy does
(`npm run window open`). It prints the deployment transaction hash at the end.

## Native lane: swap and encryption key

Two native-lane scripts, both hybrid-signed. Neither needs an EVM window:
windows govern the EVM lane only.

```bash
npm run swap -- --dry   # quote a swap from live reserves, broadcast nothing
npm run swap            # swap a small amount in the deepest pool you can trade
npm run kem status      # the ML-KEM-1024 key the chain holds for this account
npm run kem register    # derive it and publish the public half
```

`swap` computes `minOut` from the pool's live reserves with a 1% tolerance
(`QORE_SLIPPAGE_BPS`) rather than leaving the floor at zero, which on a thin
pool is how a testnet balance disappears.

`kem` **derives** the ML-KEM-1024 keypair from the account's own secret through
SHAKE-256 under a fixed domain, so the secret half can always be recomputed from
the mnemonic. A random keypair would have to be stored somewhere, and a
published encryption key whose secret half is lost is worse than none: senders
keep encrypting to it and nobody can read the result.

## Credits

Built with the QoreChain kits and templates, as the fest rules allow:

- [`create-qorechain-dapp`](https://www.npmjs.com/package/create-qorechain-dapp)
  0.14.0 — scaffolded from the `evm-solidity` template with the testnet preset.
  `contracts/Counter.sol`, `contracts/Counter.artifact.ts` and the original
  `scripts/deploy.ts` come from that template.
- `scripts/window.ts` is the window helper from the same tool's `hardhat`
  template, brought in because the `evm-solidity` template cannot open an EVM
  authorisation window. It is used essentially unmodified.
- [`@qorechain/sdk`](https://www.npmjs.com/package/@qorechain/sdk) 0.14.0 —
  `fetchPqcStatus`.
- [`@qorechain/evm`](https://www.npmjs.com/package/@qorechain/evm) 0.14.0 —
  `evmWindowStatus`, `toQorAddress`, `toEvmAddress`, and the EVM client helpers.
- [`@qorechain/pqc`](https://www.npmjs.com/package/@qorechain/pqc) 0.2.3 —
  `mlkem1024` and `shake256`, for the derived encryption keypair.
- [viem](https://viem.sh) — accounts and chain plumbing.
- [solc-js](https://www.npmjs.com/package/solc) 0.8.24 — the only compiler in
  the repo; there is no hardhat or foundry toolchain.
- [tsx](https://tsx.is) and TypeScript 5, on Node.js 24.

Original to this project: `scripts/check.ts`, `src/readiness.ts`,
`test/readiness.test.ts`, `balance.mjs`, the mnemonic-signing path added to
`scripts/deploy.ts`, `contracts/PqcGate.sol`, `scripts/compile.mjs`,
`scripts/deploy-gate.ts`, `scripts/swap.ts`, `scripts/kem.ts`,
`src/native.ts`, this README and `AI_USAGE.md`.

## Licence

MIT. See [LICENSE](LICENSE).
