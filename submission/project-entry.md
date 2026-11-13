# Project entry — paste-ready

Fields match the form at `build.qorechain.io/projects/new`.

---

## Name

```
qorechain-pq-check
```

## Tagline

```
Tells you whether an account's next EVM transaction would be admitted, and which of three reasons is blocking it.
```

## Category

**Quantum Pass** · Solo

## Description

```
QoreChain does not admit an EVM transaction on its secp256k1 signature alone.
It needs two separate things: a registered ML-DSA-87 key for the account, and a
live EVM authorisation window opened by a hybrid-signed native message. They
fail independently, and from the EVM side all three failures look identical —
a revert with nothing useful in it.

qorechain-pq-check answers one question per account: if this account sent an EVM
transaction right now, would the chain admit it, and if not, why not? It names
which of no-pqc-key, no-window or exhausted applies, and prints the command that
fixes that specific one.

Both facts are readable over REST, so the whole tool needs no private key, no
gas and no funded account. Point it at any address, including one you do not
control.

It also refuses to guess. fetchPqcStatus throws when the chain's answer cannot
be read rather than reporting "not registered", and the tool keeps that
distinction: an unreadable answer prints UNKNOWN and is counted apart from
blocked. Calling an account quantum-unsafe because of a transport failure would
be worse than saying nothing.
```

## How it's made

```
Scaffolded with create-qorechain-dapp 0.14.0 (evm-solidity template, testnet
preset), then extended.

The checker reads two facts over the testnet REST API: fetchPqcStatus from
@qorechain/sdk for the ML-DSA-87 key, and evmWindowStatus from @qorechain/evm
for the authorisation window. toQorAddress / toEvmAddress let it accept either
address form and print both, since an eth-native account is the same 20 bytes
on both lanes.

The verdict vocabulary is not invented. @qorechain/evm exports an
EvmWindowRejection union — no-window, exhausted, invalid, no-pqc-key — and the
tool's states are a direct reading of the SDK's own failure taxonomy. Before a
line was written, the SDK's type definitions were read out of node_modules so
no signature was guessed.

Ordering matters and is tested: a missing key outranks a present window,
because a window cannot exist without a key.

The pure logic lives in src/readiness.ts, apart from the I/O, so it is testable
without the network. 14 tests on Node 24's built-in runner (no new dependency)
cover both address directions and the round trip, uqor formatting down to the
smallest unit, every verdict state, and three cases pinning the rule the design
rests on: unreadable is UNKNOWN, never blocked.

What was hard:

The evm-solidity template cannot open an EVM window — its own README says so.
scripts/window.ts was brought in from the hardhat template to close that gap.
That left a seam: window.ts signs from QORE_MNEMONIC and the template's
deploy.ts read only QORE_EVM_PRIVATE_KEY, so a mnemonic was enough to open a
window and not enough to deploy into it. The failure surfaced as viem's
"expected valid private key … got 0", which names neither the variable nor the
fix. deploy.ts now resolves the signer exactly as window.ts does, at
m/44'/60'/0'/0/0, so the two cannot sign as different accounts — a deploy from a
different address would have been refused for having no window, which is a
confusing way to find a config mismatch.

The scaffold also ships no .gitignore while its .env holds a placeholder private
key. That was fixed before the first commit.
```

## Links and addresses

| Field | Value |
| --- | --- |
| Public GitHub repository | `https://github.com/faduuuu1/qorechain-pq-check` |
| Video | *record and paste the link* |
| Demo | *optional — the README's sample output is a real run* |
| Featured image | `submission/featured.png` (1280×720 PNG, 285 KB) |

**Testnet addresses** (one per line, up to 5):

```
qor1ketzqqfqda7weuz2aj84fapgcjurqer6k0stcg
```

## Kits and SDKs used — tick these

- **QoreChain SDK** → TypeScript  *(`@qorechain/sdk`, `@qorechain/evm`)*
- **create-qorechain-dapp** → TypeScript (CLI)

Nothing else. They verify against the repo's dependency files, so ticking a kit
that is not in `package.json` would simply fail to verify.

## Network features used — tick these

- **Hybrid ML-DSA-87 transactions** — `window open`, native lane, secp256k1 + ML-DSA-87
- **EVM window (incl. scoped)** — opened, used for the deploy, read by the tool

**Do not tick** *PQC key registration with proof of possession*. The account's
key reports `possessionProven: false` — QoreX registered it without a proof.
They verify these on chain, so claiming it would fail the check.

Not applicable: Solidity PQC signature check, Solidity PQC key status, QoreSeal,
smart accounts, staking, AMM pools, test tokens, IBC, cross-VM, RDK, sidechain,
light node, MCP/CLI, approved native contracts, Sign In With QoreChain, Asset
Kit, QoreScan.

## Special awards and bounties

| Award | Tick? | Why |
| --- | --- | --- |
| AI-Native | **yes** | `AI_USAGE.md` is in the repo, and documents the workflow and the mistakes |
| Regional | **Pakistan** | places the project in Asia-Pacific, one of five $200 regions |
| Quantum Campus | only if you are enrolled as a student — winners are asked for proof |
