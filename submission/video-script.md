# The submission video

The fest asks for "a video of up to 3 minutes **showing the project working**".
A demo, not a pitch. No slides, no face needed.

There is a one-command way to record it and a narrated way. Both are below.

---

## The fast path — one command, ~88 seconds

`npm run demo` plays the whole walkthrough on its own: captions on screen
between sections, real commands running live, paced for a recording. Timed at
**88 seconds**, against a 180-second limit.

Everything it runs is read-only. Nothing is signed, nothing is broadcast, no
window is consumed, and `.env` is never printed — so you can re-record as many
times as you like.

### OBS, once

1. **Sources** → `+` → **Display Capture** (simplest) or **Window Capture** and
   pick the terminal. Display Capture avoids the trap where switching windows
   leaves a black rectangle.
2. **Settings → Output → Recording Quality:** *High Quality, Medium File Size*.
   **Format:** `mp4`.
3. **Settings → Video → Base and Output Resolution:** `1920x1080`. **FPS:** 30.
   Terminal text is static; 60fps just doubles the file for nothing.
4. **Audio:** if you are not narrating, mute the mic in the Audio Mixer so the
   recording has no room hiss. If you are, speak from the script below.

### Then

```bash
# optional: makes section 2 show the "ready" verdict instead of "exhausted"
npm run window open

# make the terminal font large — Ctrl+Shift+Plus a few times — then:
npm run demo
```

Start recording, run it, stop when the last caption clears. Trim the first and
last second in OBS or any editor.

**Pacing:** `QORE_DEMO_PAUSE=6 npm run demo` holds each caption longer if 88
seconds feels rushed. `npm run demo -- --fast` skips every pause, for
rehearsing.

### Upload

YouTube **Unlisted**, Vimeo or Loom. Paste the link into the Video field on
the project page. Unlisted is enough; it does not need to be public.

---

## If you would rather narrate it

Same five beats, with words. Run the commands yourself and talk over them.

**0:00 — The problem.** On QoreChain an EVM transaction needs two separate
things: a registered ML-DSA-87 key, and a live authorisation window opened by a
hybrid-signed message. They fail independently — and from the EVM side all of
those failures look the same. A revert, with nothing useful in it.

**0:20 — An account that is not ready.**
`npm run check -- qor1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg34kqp8d`
No post-quantum key. That is the first of three causes, and the tool names it
and prints the command that fixes that one.

**0:45 — A different account.**
`npm run check -- qor1ketzqqfqda7weuz2aj84fapgcjurqer6k0stcg`
The key is registered here, so the first cause is ruled out and a different one
surfaces — with its own remedy.

**1:10 — The same question, on chain.**
`node scripts/gate-read.mjs 0x30555caffd74d276ebacff99f5f92991f8404525 qor1ketz…`
PqcGate reads the same key-status precompile and refuses to record anything for
an account with no ML-DSA-87 key. Its constructor read the precompile during
deployment, so it permanently records whether its own deployer was
quantum-safe. Algorithm 1, 2592 bytes — ML-DSA-87 at its FIPS 204 length.

**1:40 — It refuses to guess.** `npm test`
`fetchPqcStatus` throws when the chain's answer cannot be read, rather than
saying "not registered". The tool keeps that distinction: unreadable prints
UNKNOWN and is counted apart from blocked. Calling an account quantum-unsafe
because of a network blip would be worse than saying nothing. Fourteen tests,
three of them on exactly that rule.

**2:05 — Close.** No private key, no gas, no funded account — it reads two REST
endpoints, so it works against any address, including one you do not control.
Repo is in the description, MIT licensed.

---

## Two things to get right

- **Blank the mnemonic.** `npm run demo` never prints `.env`, but if you open it
  on camera for any reason, that line must be cropped, blurred or replaced.
- **Check the audio before the real take.** Record ten seconds and play it back.
  Finding out afterwards that the mic was muted is the classic way to lose an
  evening.
