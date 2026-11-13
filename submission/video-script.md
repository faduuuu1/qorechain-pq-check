# Video script — 2:45, under the 3:00 limit

Screen recording of a terminal, plus the editor for two short moments. No face
needed. Record at 1080p; keep the terminal font large enough to read.

**Before you record:** have a second throwaway testnet account with no PQC key,
so you can show the `no-pqc-key` state live instead of describing it. Fund it
from the faucet only if you want to show the full walk; the checker reads it
fine at zero balance.

---

### 0:00 — 0:25 · The problem

> On QoreChain, an EVM transaction needs two separate things. A registered
> ML-DSA-87 key for the account, and a live authorisation window opened by a
> hybrid-signed message. They fail independently — and from the EVM side, all
> of those failures look the same. A revert, with nothing useful in it.

**Show:** the README's "Why this is worth a tool" section, or just the title card.

### 0:25 — 0:50 · One command, one answer

**Run:** `npm run check -- <the fresh account>`

> So: no post-quantum key. That's the first of three ways this fails, and the
> tool names it — and gives the command that fixes that specific one.

**Show:** the `no-pqc-key` verdict and the remedy line.

### 0:50 — 1:20 · The second state

**Run:** `npm run check -- qor1ketzqqfqda7weuz2aj84fapgcjurqer6k0stcg`
(before opening a window — or show a recording of it)

> Same command, different account. The key is registered here, so the first
> problem is gone — and a second one appears. No window. Different cause,
> different remedy.

### 1:20 — 1:50 · Fixing it live

**Run:** `npm run window open`

> This is the hybrid-signed transaction: secp256k1 and ML-DSA-87 together, on
> the native lane.

**Run:** `npm run check -- qor1ketz…`

> Ready. Same command, three runs, three different answers — and the account
> walked through all of them for real.

### 1:50 — 2:15 · It is reads only

**Show:** the `.env` with the mnemonic line **blanked or cropped out**, then:

> Worth saying what this does not need. No private key, no gas, no funded
> account. It reads two REST endpoints. You can point it at any address,
> including one you do not control.

### 2:15 — 2:40 · The part I am proudest of

**Show:** `src/readiness.ts`, the `verdictFor` doc comment.

> `fetchPqcStatus` throws when the chain's answer can't be read, rather than
> saying "not registered". The tool keeps that distinction: unreadable prints
> UNKNOWN, and it's counted apart from blocked. Calling an account
> quantum-unsafe because of a network blip would be worse than saying nothing.

**Run:** `npm test`

> Fourteen tests, three of them on exactly that rule.

### 2:40 — 2:45 · Close

> qorechain-pq-check. The repo's in the description, MIT licensed.

---

## Recording notes

- **Blank the mnemonic.** If `.env` is ever on screen, that line must be
  cropped, blurred or replaced. Easiest: open a copy with the value removed.
- Clear the terminal between sections so output does not scroll off.
- `npm run check` takes a second or two — cut the dead air.
- Upload to YouTube **unlisted** or Loom, and paste the link in the Video field.
  Unlisted is enough; it does not need to be public.
