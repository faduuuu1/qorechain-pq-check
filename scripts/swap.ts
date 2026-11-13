/**
 * swap.ts - swap tokens in a pool of the native AMM.
 *
 *   npm run swap              pick a pool this account can trade in, swap a little
 *   npm run swap -- --dry     work out the quote and print it, broadcast nothing
 *
 * The swap is a native-lane message (`/qorechain.amm.v1.MsgSwapExactIn`) signed
 * hybrid, so it needs a registered ML-DSA-87 key but no EVM window: windows
 * govern the EVM lane only.
 *
 * `minOut` is computed from the pool's live reserves rather than left at zero.
 * A zero floor is the same as accepting any price at all, which on a thin
 * testnet pool is a real way to lose the balance you were about to trade.
 *
 * Environment (all optional):
 *   QORE_POOL_ID        trade this pool instead of choosing one
 *   QORE_SWAP_AMOUNT    amount of tokenIn, in its base units
 *   QORE_SLIPPAGE_BPS   tolerance below the quote, default 100 (= 1%)
 */
import { amm } from "@qorechain/sdk";
import { account, broadcast, network } from "../src/native.js";

interface Pool {
  id: string;
  pool_type: string;
  token_a: string;
  token_b: string;
  reserve_a: string;
  reserve_b: string;
  status: string;
}

const DEFAULT_SWAP_FEE_BPS = 30n; // 0.30%, the usual constant-product fee
const BPS = 10_000n;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** The AMM's swap fee in basis points, or the usual default if unpublished. */
async function swapFeeBps(rest: string): Promise<bigint> {
  try {
    const body = await getJson<{ params?: Record<string, string> }>(
      `${rest}/qorechain/amm/v1/params`,
    );
    const raw = body.params?.swap_fee_bps;
    if (raw !== undefined) return BigInt(raw);
  } catch {
    // Params are a nicety: the quote still works on the documented default.
  }
  return DEFAULT_SWAP_FEE_BPS;
}

/** Constant-product output, fee taken off the input. */
function quoteExactIn(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps: bigint) {
  const afterFee = (amountIn * (BPS - feeBps)) / BPS;
  return (reserveOut * afterFee) / (reserveIn + afterFee);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry");
  const net = network();
  const acc = await account();

  const [{ pools }, balancesBody, feeBps] = await Promise.all([
    getJson<{ pools: Pool[] }>(`${net.rest}/qorechain/amm/v1/pools`),
    getJson<{ balances: { denom: string; amount: string }[] }>(
      `${net.rest}/cosmos/bank/v1beta1/balances/${acc.cosmos}`,
    ),
    swapFeeBps(net.rest),
  ]);

  const balances = new Map(balancesBody.balances.map((b) => [b.denom, BigInt(b.amount)]));
  console.log(`account: ${acc.cosmos}`);
  console.log(`pools:   ${pools.length}, swap fee ${feeBps} bps\n`);

  // Choose a pool: one that is active, has reserves on both sides, and whose
  // token_a this account actually holds. Holding uqor is not enough on its own -
  // uqor is the gas denom, and trading it away is how you strand the account.
  const wanted = process.env.QORE_POOL_ID?.trim();
  const candidates = pools.filter((p) => {
    if (p.status !== "active") return false;
    if (BigInt(p.reserve_a) <= 0n || BigInt(p.reserve_b) <= 0n) return false;
    return (balances.get(p.token_a) ?? 0n) > 0n;
  });

  const pool = wanted
    ? pools.find((p) => p.id === wanted)
    : // Prefer the deepest pool: the shallower one moves price further per unit.
      candidates.sort((a, b) => (BigInt(b.reserve_b) > BigInt(a.reserve_b) ? 1 : -1))[0];

  if (!pool) {
    console.error(
      wanted
        ? `No pool with id ${wanted}.`
        : "No active pool whose token_a this account holds. Fund the account with a pool token first.",
    );
    process.exitCode = 1;
    return;
  }

  const held = balances.get(pool.token_a) ?? 0n;
  const reserveIn = BigInt(pool.reserve_a);
  const reserveOut = BigInt(pool.reserve_b);

  // Trade a small slice: enough to be a real swap, small enough that the price
  // impact on a testnet pool stays negligible.
  const requested = process.env.QORE_SWAP_AMOUNT?.trim();
  const amountIn = requested
    ? BigInt(requested)
    : (() => {
        const onePercentOfReserve = reserveIn / 100n;
        const tenthOfBalance = held / 10n;
        const v = tenthOfBalance < onePercentOfReserve ? tenthOfBalance : onePercentOfReserve;
        return v > 0n ? v : 1n;
      })();

  if (amountIn > held) {
    throw new Error(`Want to swap ${amountIn} but the account holds ${held} ${pool.token_a}`);
  }

  const expectedOut = quoteExactIn(amountIn, reserveIn, reserveOut, feeBps);
  const slippageBps = BigInt(process.env.QORE_SLIPPAGE_BPS ?? "100");
  const minOut = (expectedOut * (BPS - slippageBps)) / BPS;

  console.log(`pool:     ${pool.id} (${pool.pool_type})`);
  console.log(`token in: ${pool.token_a}`);
  console.log(`held:     ${held}`);
  console.log(`reserves: ${reserveIn} in / ${reserveOut} out`);
  console.log(`\nswapping: ${amountIn}`);
  console.log(`quote:    ${expectedOut} ${pool.token_b}`);
  console.log(`min out:  ${minOut}  (${slippageBps} bps tolerance)`);

  if (minOut <= 0n) {
    throw new Error("Quote rounds to zero: raise QORE_SWAP_AMOUNT.");
  }
  if (dryRun) {
    console.log("\n--dry: nothing broadcast.");
    return;
  }

  const msg = amm.swapExactIn({
    sender: acc.cosmos,
    poolId: pool.id,
    tokenIn: { denom: pool.token_a, amount: amountIn.toString() },
    denomOut: pool.token_b,
    minOut: minOut.toString(),
  });

  const hash = await broadcast(acc, "hybrid", [msg]);
  console.log(`\nswapped: ${hash}`);
  console.log('Now press Check on "First swap in a pool" at build.qorechain.io/me');
}

main().catch((err: unknown) => {
  console.error("\nSwap failed.");
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
