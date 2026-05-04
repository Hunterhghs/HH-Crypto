import { PublicKey } from "@solana/web3.js";

/** Native USDC on Solana mainnet */
export const USDC_MINT_MAINNET = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
);

/** SPL USDT on Solana mainnet (USD-pegged; routes vary by pool liquidity). */
export const USDT_MINT_MAINNET = new PublicKey(
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
);

/** Dollar-pegged settlement options for ExactOut (both use 6 decimals). */
export const STABLE_SETTLEMENTS = [
  {
    id: "usdc" as const,
    label: "USDC",
    description: "Circle USDC (common default)",
    mint: USDC_MINT_MAINNET,
    decimals: 6,
  },
  {
    id: "usdt" as const,
    label: "USDT",
    description: "Tether SPL (~$1 peg; liquidity differs from USDC)",
    mint: USDT_MINT_MAINNET,
    decimals: 6,
  },
];

export type StableSettlementId = (typeof STABLE_SETTLEMENTS)[number]["id"];

export function settlementById(id: StableSettlementId) {
  const row = STABLE_SETTLEMENTS.find((s) => s.id === id);
  if (!row) throw new Error(`Unknown settlement: ${id}`);
  return row;
}

export const JUPITER_LITE_QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";
export const JUPITER_LITE_SWAP_URL = "https://lite-api.jup.ag/swap/v1/swap";

/** HH mint must be configured via NEXT_PUBLIC_HH_MINT — never hardcode issuer tokens. */
export function getConfiguredHhMint(): PublicKey | null {
  const raw = process.env.NEXT_PUBLIC_HH_MINT?.trim();
  if (!raw) return null;
  try {
    return new PublicKey(raw);
  } catch {
    return null;
  }
}

export function getMerchantWallet(): PublicKey | null {
  const raw = process.env.NEXT_PUBLIC_MERCHANT_WALLET?.trim();
  if (!raw) return null;
  try {
    return new PublicKey(raw);
  } catch {
    return null;
  }
}

export function getHhDecimals(): number {
  const n = Number(process.env.NEXT_PUBLIC_HH_DECIMALS ?? "9");
  return Number.isFinite(n) ? n : 9;
}

/** True when env is set but is not a valid Solana address (e.g. pasted description text). */
export function hasInvalidHhMintEnv(): boolean {
  const raw = process.env.NEXT_PUBLIC_HH_MINT?.trim();
  if (!raw) return false;
  try {
    new PublicKey(raw);
    return false;
  } catch {
    return true;
  }
}

export function hasInvalidMerchantEnv(): boolean {
  const raw = process.env.NEXT_PUBLIC_MERCHANT_WALLET?.trim();
  if (!raw) return false;
  try {
    new PublicKey(raw);
    return false;
  } catch {
    return true;
  }
}
