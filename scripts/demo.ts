/**
 * demo.ts - the whole walkthrough, paced for a screen recording.
 *
 *   npm run demo            full run, timed for a video (about 2 minutes)
 *   npm run demo -- --fast  no pauses, for rehearsing
 *
 * Why this exists: the fest wants "a video of up to 3 minutes showing the
 * project working". Driving that by hand means typing commands live, which
 * means typos, dead air and retakes. This runs the whole thing end to end with
 * captions on screen, so recording it is: start OBS, run one command, stop.
 *
 * Every command here is read-only. Nothing is signed, nothing is broadcast, no
 * window is consumed, and .env is never printed. You can run it as many times
 * as you like while getting the recording right.
 *
 * Pacing: QORE_DEMO_PAUSE sets the seconds a caption stays up (default 4).
 */
import { execSync } from "node:child_process";

const FAST = process.argv.includes("--fast");
const PAUSE = Number(process.env.QORE_DEMO_PAUSE ?? "4");

const B = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const R = "\x1b[0m";

/** An address with no registered key: 0x1111…, bech32-encoded. Not a real
 *  account and not a secret - it exists only to show the blocked verdict. */
const DEMO_ADDRESS = "qor1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg34kqp8d";

/** The account this project uses on testnet. */
const REAL_ADDRESS = "qor1ketzqqfqda7weuz2aj84fapgcjurqer6k0stcg";

/** PqcGate, deployed and exercised on testnet. */
const GATE = "0x30555caffd74d276ebacff99f5f92991f8404525";

const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

function clear(): void {
  if (!FAST) process.stdout.write("\x1b[2J\x1b[H");
}

/** A full-width caption, so the video reads without narration. */
async function caption(title: string, ...lines: string[]): Promise<void> {
  clear();
  const bar = "─".repeat(74);
  console.log(`${CYAN}${bar}${R}`);
  console.log(`${B}  ${title}${R}`);
  for (const l of lines) console.log(`${DIM}  ${l}${R}`);
  console.log(`${CYAN}${bar}${R}\n`);
  if (!FAST) await sleep(PAUSE);
}

function run(cmd: string): void {
  console.log(`${GREEN}$ ${cmd}${R}\n`);
  try {
    // No `shell` option: execSync uses the platform default, which is what
    // resolves npm to npm.cmd on Windows. Passing shell:"true" looks harmless
    // and is not - it is read as a path to a shell binary, the spawn fails, and
    // the catch below hides it, so the demo plays with every command silent.
    execSync(cmd, { stdio: "inherit" });
  } catch (err) {
    // A non-zero exit is still worth seeing on screen - the output above says
    // why - but a command that never ran at all must not pass unnoticed.
    const code = (err as { status?: number }).status;
    if (code === undefined) {
      console.error(`\n${B}[demo] "${cmd}" could not be started.${R}`);
      throw err;
    }
    console.log(`${DIM}[exit ${code}]${R}`);
  }
}

async function beat(s = PAUSE): Promise<void> {
  if (!FAST) await sleep(s);
}

async function main(): Promise<void> {
  await caption(
    "qorechain-pq-check",
    "On QoreChain an EVM transaction needs two separate things:",
    "a registered ML-DSA-87 key, and a live authorisation window.",
    "They fail independently - and from the EVM side all of those",
    "failures look identical. A revert, with nothing useful in it.",
  );

  await caption(
    "1 / 5   An account that is not ready",
    "One command. It names which of the three causes applies,",
    "and prints the command that fixes that specific one.",
  );
  run(`npm run check -- ${DEMO_ADDRESS}`);
  await beat(PAUSE + 3);

  // Deliberately state-agnostic. Depending on the window this account prints
  // ready, no-window or exhausted, and the caption has to be true for all
  // three - a caption that says "ready" and output that says "exhausted" is
  // worse than no caption. Run `npm run window open` first to film the ready
  // case; leave it and the exhausted case makes the same point.
  await caption(
    "2 / 5   A different account, a different answer",
    "Same command, different account. The key is registered here, so",
    "the first cause is ruled out and a different one surfaces.",
    "Whatever the verdict, it names the cause and the remedy for it.",
  );
  run(`npm run check -- ${REAL_ADDRESS}`);
  await beat(PAUSE + 3);

  await caption(
    "3 / 5   The same question, enforced on chain",
    "PqcGate reads the same key-status precompile at 0x...0a02 and",
    "refuses to record anything for an account with no ML-DSA-87 key.",
    "Its constructor read the precompile during deployment, so it also",
    "records whether its own deployer was quantum-safe.",
  );
  run(`node scripts/gate-read.mjs ${GATE} ${REAL_ADDRESS}`);
  await beat(PAUSE + 3);

  await caption(
    "4 / 5   It refuses to guess",
    "fetchPqcStatus throws when the chain's answer cannot be read,",
    "rather than reporting 'not registered'. The tool keeps that apart:",
    "unreadable prints UNKNOWN and is counted apart from blocked.",
    "Calling an account quantum-unsafe because of a network blip",
    "would be worse than saying nothing.",
  );
  run("npm test");
  await beat(PAUSE + 2);

  await caption(
    "5 / 5   What it does not need",
    "No private key. No gas. No funded account.",
    "It reads two REST endpoints, so it works against any address,",
    "including one you do not control - every command above included.",
    "",
    "github.com/faduuuu1/qorechain-pq-check    MIT",
  );
  await beat(PAUSE + 3);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
