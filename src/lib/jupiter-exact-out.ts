/**
 * Thin helpers for Jupiter "Payments Through Swap" style quotes (ExactOut).
 * Settlement: configurable mint on Solana. Input: HH mint from env.
 */
import {
  JUPITER_LITE_QUOTE_URL,
  JUPITER_LITE_SWAP_URL,
} from "@/lib/tokens";

/** Stable-token smallest units → float (~USD for USDC/USDT). */
export function atomsToUsdLike(atoms: string, decimals: number): number {
  return Number(BigInt(atoms)) / 10 ** decimals;
}

export function hhAtomsToHuman(atoms: string, decimals: number): number {
  return Number(BigInt(atoms)) / 10 ** decimals;
}

/** ~USD face amount → atom count (USDC/USDT both 6 decimals). */
export function usdStableDollarsToAtoms(dollars: number): bigint {
  return BigInt(Math.round(dollars * 1e6));
}

export type JupiterQuoteResponse = Record<string, unknown> & {
  inputMint?: string;
  outputMint?: string;
  inAmount?: string;
  outAmount?: string;
  swapMode?: string;
  routePlan?: unknown;
};

export async function quoteExactOutHhToSettlement(params: {
  hhMint: string;
  settlementMint: string;
  /** Exact settlement-token atoms merchant should receive */
  exactOutAtoms: bigint;
  /** Default 150 = 1.5% */
  slippageBps?: number;
  /** Restrict intermediate hops (Jupiter Payments guidance) */
  restrictIntermediateTokens?: boolean;
}): Promise<JupiterQuoteResponse> {
  const {
    hhMint,
    settlementMint,
    exactOutAtoms,
    slippageBps = 150,
    restrictIntermediateTokens = true,
  } = params;

  const u = new URL(JUPITER_LITE_QUOTE_URL);
  u.searchParams.set("inputMint", hhMint);
  u.searchParams.set("outputMint", settlementMint);
  u.searchParams.set("amount", exactOutAtoms.toString());
  u.searchParams.set("swapMode", "ExactOut");
  u.searchParams.set("slippageBps", String(slippageBps));
  u.searchParams.set(
    "restrictIntermediateTokens",
    restrictIntermediateTokens ? "true" : "false",
  );

  const res = await fetch(u.toString(), { method: "GET", cache: "no-store" });
  const body: unknown = await res.json();
  if (!res.ok) {
    const err =
      typeof body === "object" && body && "error" in body
        ? String((body as { error: unknown }).error)
        : res.statusText;
    throw new Error(err || "Quote request failed");
  }
  return body as JupiterQuoteResponse;
}

export async function buildSwapTransaction(params: {
  quoteResponse: JupiterQuoteResponse;
  customerPubkey: string;
  /** Merchant SPL token associated account for settlement mint */
  destinationTokenAccount: string;
}): Promise<string> {
  const { quoteResponse, customerPubkey, destinationTokenAccount } = params;
  const res = await fetch(JUPITER_LITE_SWAP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: customerPubkey,
      destinationTokenAccount,
      wrapAndUnwrapSol: true,
    }),
  });
  const body: unknown = await res.json();
  if (!res.ok) {
    const err =
      typeof body === "object" && body && "error" in body
        ? String((body as { error: unknown }).error)
        : res.statusText;
    throw new Error(err || "Swap build failed");
  }
  if (
    typeof body !== "object" ||
    !body ||
    !("swapTransaction" in body) ||
    typeof (body as { swapTransaction: unknown }).swapTransaction !== "string"
  ) {
    throw new Error("Unexpected swap response");
  }
  return (body as { swapTransaction: string }).swapTransaction;
}
