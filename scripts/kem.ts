/**
 * kem.ts - publish this account's ML-KEM-1024 encapsulation key, so others can
 * send it QoreSeal-encrypted data.
 *
 *   npm run kem status     show the key the chain has for this account
 *   npm run kem register   derive the keypair and publish the public half
 *
 * The key is DERIVED, not generated at random. `mlkem1024.keygen(seed)` takes a
 * seed, so the seed is taken from the account's own secret through SHAKE-256
 * under a fixed domain string. That means the secret half can always be
 * recomputed from the mnemonic already in .env.
 *
 * A randomly generated KEM key would have to be written down somewhere, and the
 * one thing worse than having no encryption key published is having one
 * published whose secret half is gone: senders would keep encrypting to it and
 * nobody could ever read the result.
 *
 * Only the public half is ever sent to the chain or printed.
 */
import { mlkem1024, shake256 } from "@qorechain/pqc";
import { fetchKemKey, pqcMsg, validateKemPublicKey } from "@qorechain/sdk";
import { account, broadcast, network } from "../src/native.js";

/** Algorithm id of ML-KEM-1024 in the on-chain registry. */
const ALGORITHM_ML_KEM_1024 = 2;

/** Public key length FIPS 203 defines for ML-KEM-1024. */
const ML_KEM_1024_PUBKEY_BYTES = 1568;

/** Domain separation: this seed must never collide with another key's seed. */
const SEED_DOMAIN = "qorechain-pq-check/kem/v1";

/** Seed bytes for mlkem1024.keygen, derived from the account's secp256k1 secret. */
function kemSeed(privateKeyHex: string): Uint8Array {
  const secret = Uint8Array.from(Buffer.from(privateKeyHex.replace(/^0x/, ""), "hex"));
  const domain = new TextEncoder().encode(SEED_DOMAIN);
  const input = new Uint8Array(domain.length + secret.length);
  input.set(domain, 0);
  input.set(secret, domain.length);
  return shake256(input, 64);
}

async function status(): Promise<void> {
  const net = network();
  const acc = await account();
  console.log(`account: ${acc.cosmos}`);

  const result = await fetchKemKey({ rest: net.rest, address: acc.cosmos });
  const key = result.key;
  if (!key) {
    console.log("KEM key: none published (run: npm run kem register)");
    return;
  }
  console.log(`KEM key: ${key.algorithmName} (id ${key.algorithmId})`);
  console.log(`  bytes:      ${key.publicKey.length} (FIPS 203 expects ${ML_KEM_1024_PUBKEY_BYTES})`);
  console.log(`  registered: height ${key.registeredHeight}`);

  // Is the published key the one this mnemonic derives? If not, the secret half
  // of whatever is published is not in this .env, and messages sent to it cannot
  // be read here.
  const derived = mlkem1024.keygen(kemSeed(acc.privateKey));
  const same =
    derived.publicKey.length === key.publicKey.length &&
    derived.publicKey.every((b, i) => b === key.publicKey[i]);
  console.log(`  this key:   ${same ? "yes" : "NO - published key was not derived from this account"}`);
}

async function register(): Promise<void> {
  const net = network();
  const acc = await account();

  const existing = await fetchKemKey({ rest: net.rest, address: acc.cosmos });
  if (existing.key) {
    console.log("This account already publishes a KEM key. Registering again would replace it.");
    console.log("Run `npm run kem status` to see it.");
    return;
  }

  const keypair = mlkem1024.keygen(kemSeed(acc.privateKey));
  console.log(`account:    ${acc.cosmos}`);
  console.log(`algorithm:  ML-KEM-1024 (id ${ALGORITHM_ML_KEM_1024})`);
  console.log(`public key: ${keypair.publicKey.length} bytes`);

  // The SDK checks the length and algorithm before the chain has to.
  validateKemPublicKey(keypair.publicKey, ALGORITHM_ML_KEM_1024);

  const message = pqcMsg.registerKemKey({
    sender: acc.cosmos,
    algorithmId: ALGORITHM_ML_KEM_1024,
    publicKey: keypair.publicKey,
  });

  const hash = await broadcast(acc, "hybrid", [message]);
  console.log(`\nregistered: ${hash}`);
  console.log('Now press Check on "First QoreSeal key" at build.qorechain.io/me');
}

const commands: Record<string, () => Promise<void>> = { status, register };
const cmd = process.argv[2] ?? "status";
const run = commands[cmd];
if (!run) {
  console.error(`Unknown command "${cmd}". Use: status | register`);
  process.exit(1);
}
run().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
