# Video script — 2:40, under the 3:00 limit

Screen recording of a terminal, plus the editor for two short moments. No face
needed. Record at 1080p; keep the terminal font large enough to read.

The fest asks for "a video of up to 3 minutes **showing the project working**",
so this is a demo, not a pitch. No slides, no intro card beyond a title.

**Before you record:** have a second throwaway testnet account with no PQC key,
so you can show the `no-pqc-key` state live instead of describing it. The
checker reads it fine at zero balance, so it does not need funding.

**Blank the mnemonic.** If `.env` is ever on screen, that line must be cropped,
blurred or replaced. Easiest: open a copy with the value removed.

---

### 0:00 — 0:20 · The problem

> On QoreChain, an EVM transaction needs two separate things. A registered
> ML-DSA-87 key for the account, and a live authorisation window opened by a
> hybrid-signed message. They fail independently — and from the EVM side, all
> of those failures look the same. A revert, with nothing useful in it.

**Show:** the README title, or the "Why this is worth a tool" section.

### 0:20 — 0:45 · One command, one answer

**Run:** `npm run check -- <the fresh account>`

> No post-quantum key. That's the first of three ways this fails, and the tool
> names it — and prints the command that fixes that specific one.

### 0:45 — 1:10 · The second state

**Run:** `npm run check -- qor1ketzqqfqda7weuz2aj84fapgcjurqer6k0stcg`
(before opening a window, or play a recording of it)

> Same command, different account. The key is registered, so the first problem
> is gone — and a second one appears. No window. Different cause, different
> remedy.

### 1:10 — 1:35 · Fixing it live

**Run:** `npm run window open`

> This is the hybrid-signed transaction: secp256k1 and ML-DSA-87 together, on
> the native lane.

**Run:** `npm run check -- qor1ketz…`

> Ready. Same command, three runs, three different answers.

### 1:35 — 2:05 · The same question, on chain

**Run:** `npm run deploy:gate`

> The checker answers that question off chain. PqcGate enforces it on chain. It
> reads the same key-status precompile, and refuses to record anything for an
> account with no registered ML-DSA-87 key.
>
> Watch the constructor: it reads the precompile during deployment, so the gate
> permanently records whether its own deployer was quantum-safe. Algorithm 1,
> 2592 bytes — ML-DSA-87 at its FIPS 204 length.

**Show:** the `keyStatus` output and the `attest` call going through.

### 2:05 — 2:25 · It is reads only, and it refuses to guess

**Show:** `src/readiness.ts`, the `verdictFor` doc comment.

> The checker needs no private key, no gas and no funded account — it reads two
> REST endpoints, so you can point it at any address, including one you do not
> control.
>
> And `fetchPqcStatus` throws when the chain's answer can't be read, rather
> than saying "not registered". The tool keeps that distinction: unreadable
> prints UNKNOWN, counted apart from blocked. Calling an account
> quantum-unsafe because of a network blip would be worse than saying nothing.

**Run:** `npm test`

> Fourteen tests, three of them on exactly that rule.

### 2:25 — 2:40 · Close

> Also on the native lane: a swap that computes its minimum output from live
> reserves, and an ML-KEM-1024 encryption key derived from the account's own
> secret, so it can always be recomputed rather than stored.
>
> qorechain-pq-check. Repo's in the description, MIT licensed.

---

## If you need a shorter cut

Drop sections 1:35–2:05 and 2:25–2:40 and the demo still stands on its own at
about **1:50**: problem, three states, the fix, the UNKNOWN rule, tests.

## Recording notes

- Clear the terminal between sections so output does not scroll off.
- `npm run check` takes a second or two — cut the dead air.
- `npm run deploy:gate` needs a live window. Run `npm run window open` first,
  or the deploy is refused.
- Upload to YouTube **unlisted**, Vimeo or Loom, and paste the link in the
  Video field on the project page. Unlisted is enough; it does not need to be
  public.
