/**
 * native.ts - the native-lane essentials: which network, which account, and how
 * to get a hybrid-signed message onto the chain.
 *
 * This is the same sequence `scripts/window.ts` performs. It is written out
 * again here rather than extracted from that file on purpose: window.ts is the
 * script that opens the EVM authorisation window, every deploy depends on it,
 * and it is known to work. Refactoring it to serve two newer scripts would risk
 * the one thing in the repo that must not break.
 */
import { StargateClient } from "@cosmjs/stargate";
import {
  EthNativeSigner,
  deriveUnifiedAccount,
  unifiedAccountFromSeed,
  isValidRecoveryCode,
  type UnifiedAccount,
} from "@qorechain/sdk";

export const NETWORKS = {
  testnet: {
    chainId: "qorechain-diana",
    rest: "https://api-testnet.qore.host",
    rpc: "https://rpc-testnet.qore.host",
  },
  mainnet: {
    chainId: "qorechain-vladi",
    rest: "https://api.qore.host",
    rpc: "https://rpc.qore.host",
  },
} as const;

export type NetworkName = keyof typeof NETWORKS;
export type Network = (typeof NETWORKS)[NetworkName];

/** The network named by QORE_NETWORK, testnet when unset. */
export function network(): Network {
  const name = (process.env.QORE_NETWORK ?? "testnet") as NetworkName;
  const n = NETWORKS[name];
  if (!n) throw new Error(`QORE_NETWORK must be "testnet" or "mainnet", got "${name}"`);
  return n;
}

/** The signing account: QORE_MNEMONIC first, PRIVATE_KEY + recovery code second. */
export async function account(): Promise<UnifiedAccount> {
  const mnemonic = process.env.QORE_MNEMONIC?.trim();
  if (mnemonic) return deriveUnifiedAccount(mnemonic, 0);

  const key = process.env.PRIVATE_KEY?.trim();
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "Set QORE_MNEMONIC, or PRIVATE_KEY as 0x followed by 64 hex characters, in .env",
    );
  }
  const recoveryCode = process.env.QORE_PQC_RECOVERY_CODE?.trim();
  if (!recoveryCode) {
    throw new Error(
      "Set QORE_PQC_RECOVERY_CODE in .env, or set QORE_MNEMONIC instead. " +
        "With PRIVATE_KEY the ML-DSA-87 key comes from a separate recovery code " +
        "(`npm run window recovery-code`).",
    );
  }
  if (!isValidRecoveryCode(recoveryCode)) {
    throw new Error("QORE_PQC_RECOVERY_CODE is not a valid QRC1 recovery code (check for a typo)");
  }
  return unifiedAccountFromSeed(Uint8Array.from(Buffer.from(key.slice(2), "hex")), {
    recoveryCode,
  });
}

/** account_number and sequence over REST; the chain rejects a guess at either. */
export async function accountSequence(
  rest: string,
  address: string,
): Promise<{ accountNumber: bigint; sequence: bigint }> {
  const res = await fetch(`${rest}/cosmos/auth/v1beta1/accounts/${address}`);
  if (res.status === 404) {
    throw new Error(`${address} does not exist on chain yet: send it some QOR first`);
  }
  if (!res.ok) throw new Error(`account query failed: HTTP ${res.status}`);
  const body = (await res.json()) as { account?: Record<string, unknown> };
  const acc = (body.account?.base_account ?? body.account ?? {}) as Record<string, string>;
  return {
    accountNumber: BigInt(acc.account_number ?? "0"),
    sequence: BigInt(acc.sequence ?? "0"),
  };
}

/** A native-lane fee. Hybrid transactions carry a 3309-byte signature, so the
 *  gas limit is generous rather than tight. */
export const FEE = { amount: [{ denom: "uqor", amount: "100000" }], gas: "800000" };

/** Sign a native-lane message and broadcast it. */
export async function broadcast(
  acc: UnifiedAccount,
  mode: "hybrid" | "classical",
  messages: Parameters<EthNativeSigner["sign"]>[0]["messages"],
): Promise<string> {
  const net = network();
  const { accountNumber, sequence } = await accountSequence(net.rest, acc.cosmos);
  const signer = new EthNativeSigner(acc, { signMode: mode, rest: net.rest });
  const transport = await StargateClient.connect(net.rpc);
  try {
    const res = await signer.signAndBroadcast(transport, {
      chainId: net.chainId,
      accountNumber,
      sequence,
      fee: FEE,
      messages,
    });
    return res.transactionHash;
  } finally {
    transport.disconnect();
  }
}
