"use client";

import {
  atomsToUsdLike,
  buildSwapTransaction,
  hhAtomsToHuman,
  quoteExactOutHhToSettlement,
  usdStableDollarsToAtoms,
  type JupiterQuoteResponse,
} from "@/lib/jupiter-exact-out";
import {
  type StableSettlementId,
  settlementById,
  STABLE_SETTLEMENTS,
  getConfiguredHhMint,
  getHhDecimals,
  getMerchantWallet,
  hasInvalidHhMintEnv,
  hasInvalidMerchantEnv,
} from "@/lib/tokens";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction } from "@solana/web3.js";
import { useCallback, useMemo, useState } from "react";

const GIFT_DENOMS_USD = [5, 10, 25, 50, 100] as const;

function truncateAddr(base58: string, head = 4, tail = 4): string {
  if (base58.length <= head + tail + 1) return base58;
  return `${base58.slice(0, head)}…${base58.slice(-tail)}`;
}

export function GiftCardCheckout() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();
  const hhMint = useMemo(() => getConfiguredHhMint(), []);
  const merchant = useMemo(() => getMerchantWallet(), []);
  const hhDecimals = useMemo(() => getHhDecimals(), []);

  const [settlementId, setSettlementId] = useState<StableSettlementId>("usdc");
  const settlement = useMemo(
    () => settlementById(settlementId),
    [settlementId],
  );

  const merchantSettlementAta = useMemo(() => {
    if (!merchant) return null;
    try {
      return getAssociatedTokenAddressSync(settlement.mint, merchant);
    } catch {
      return null;
    }
  }, [merchant, settlement.mint]);

  const [denom, setDenom] = useState<(typeof GIFT_DENOMS_USD)[number]>(25);
  const [quote, setQuote] = useState<JupiterQuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"quote" | "pay" | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  const runQuote = useCallback(async () => {
    if (!hhMint) {
      setQuoteError("Set NEXT_PUBLIC_HH_MINT in .env.local");
      return;
    }
    setQuoteError(null);
    setTxSig(null);
    setPayError(null);
    setBusy("quote");
    setQuote(null);
    try {
      const atoms = usdStableDollarsToAtoms(denom);
      const q = await quoteExactOutHhToSettlement({
        hhMint: hhMint.toBase58(),
        settlementMint: settlement.mint.toBase58(),
        exactOutAtoms: atoms,
      });
      setQuote(q);
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : "Quote failed");
    } finally {
      setBusy(null);
    }
  }, [hhMint, denom, settlement.mint]);

  const runPay = useCallback(async () => {
    setPayError(null);
    setTxSig(null);
    if (
      !hhMint ||
      !merchant ||
      !merchantSettlementAta ||
      !quote ||
      !publicKey ||
      !signTransaction
    ) {
      setPayError("Wallet, merchant wallet, HH mint, and quote required.");
      return;
    }

    const inAmt = quote.inAmount;
    const outAmt = quote.outAmount;
    if (!inAmt || !outAmt) {
      setPayError("Invalid quote payload.");
      return;
    }

    setBusy("pay");
    try {
      const swapB64 = await buildSwapTransaction({
        quoteResponse: quote,
        customerPubkey: publicKey.toBase58(),
        destinationTokenAccount: merchantSettlementAta.toBase58(),
      });
      const buf = Buffer.from(swapB64, "base64");
      let vtx = VersionedTransaction.deserialize(buf);
      vtx = await signTransaction(vtx);

      const sig = await connection.sendRawTransaction(vtx.serialize(), {
        maxRetries: 5,
        skipPreflight: false,
      });

      await connection.confirmTransaction(sig, "confirmed");
      setTxSig(sig);
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(null);
    }
  }, [
    hhMint,
    merchant,
    merchantSettlementAta,
    quote,
    publicKey,
    signTransaction,
    connection,
  ]);

  const quoteSummary =
    quote && quote.inAmount && quote.outAmount
      ? {
          hhIn: hhAtomsToHuman(quote.inAmount, hhDecimals),
          settledDelivered: atomsToUsdLike(
            quote.outAmount,
            settlement.decimals,
          ),
        }
      : null;

  const configReady = Boolean(hhMint && merchant && merchantSettlementAta);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="rounded-2xl border border-amber-900/70 bg-amber-950/40 p-4 text-sm text-amber-100">
        <p className="font-medium text-amber-50">
          Executable value only — wallet “portfolio” totals can diverge massively.
        </p>
        {configReady ? (
          <p className="mt-2 text-sm leading-relaxed text-amber-100/85">
            Jupiter quotes live routes: thin HH liquidity means high HH cost or
            failed quotes. Settlement is on-chain SPL only (e.g. USDC / USDT);
            issuing a branded gift-card code or mailing a physical good is{" "}
            <span className="text-amber-50">separate fulfillment</span> you or a
            partner API operates after funds arrive.
          </p>
        ) : (
          <p className="mt-2 leading-relaxed text-amber-100/90">
            This flow moves HH → a stable SPL on Solana via Jupiter (ExactOut).
            Retail gift-card APIs expect USD / card rails — usual pattern is swap
            to stable here, then a backend buys the card. That second step is
            not wired in yet.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-violet-900/45 bg-violet-950/30 p-4 text-sm text-violet-100">
        <p className="font-medium text-violet-50">
          Buying real gift cards or “other goods”
        </p>
        <p className="mt-2 leading-relaxed text-violet-100/88">
          This page handles the <strong>crypto leg</strong> (HH swapped into a
          stable SPL in the merchant wallet). To <strong>purchase an actual
          card or SKU</strong>, you integrate a merchant API (often KYC /
          treasury), or manually fulfill after verifying the Solana tx. No
          on-chain Jupiter route magically buys Amazon balance — vendors settle
          in fiat or stables via their systems.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-100">Wallet</h2>
        <WalletMultiButton className="!bg-violet-600 !font-medium hover:!bg-violet-500" />
      </div>

      {!configReady && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/50 p-4 text-sm text-red-100">
          <p className="font-medium">Configure environment variables</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {!hhMint && !hasInvalidHhMintEnv() && (
              <li>
                <code className="text-red-200">NEXT_PUBLIC_HH_MINT</code> — full
                Solana mint (base58 only, no spaces or English text)
              </li>
            )}
            {hasInvalidHhMintEnv() && (
              <li>
                <code className="text-red-200">NEXT_PUBLIC_HH_MINT</code> is set but
                not valid base58 (remove placeholder text; paste the real mint from
                Solscan or your wallet)
              </li>
            )}
            {!merchant && !hasInvalidMerchantEnv() && (
              <li>
                <code className="text-red-200">NEXT_PUBLIC_MERCHANT_WALLET</code> —
                merchant Solana address (base58)
              </li>
            )}
            {hasInvalidMerchantEnv() && (
              <li>
                <code className="text-red-200">NEXT_PUBLIC_MERCHANT_WALLET</code> is
                set but not valid base58
              </li>
            )}
            {merchant && !merchantSettlementAta && (
              <li>Could not derive merchant deposit address for settlement token.</li>
            )}
          </ul>
          <p className="mt-2 opacity-90">
            For local dev, use <code className="rounded bg-black/30 px-1">.env.local</code>
            . On Cloudflare Pages / Vercel, set variables in the dashboard and{" "}
            <span className="font-medium text-red-50">redeploy</span> —{" "}
            <code className="text-red-200/90">NEXT_PUBLIC_*</code> is baked in at{" "}
            <code className="rounded bg-black/30 px-1">npm run build</code>.
          </p>
        </div>
      )}

      {configReady && hhMint && merchant && merchantSettlementAta && (
        <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/35 p-4 text-sm text-emerald-100">
          <p className="font-medium text-emerald-50">Build configuration</p>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
              <dt className="shrink-0 text-emerald-200/80">Settlement</dt>
              <dd className="font-mono text-emerald-100">
                {settlement.label}{" "}
                <span className="text-emerald-200/65">(~$1 peg, not advice)</span>
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
              <dt className="shrink-0 text-emerald-200/80">HH mint</dt>
              <dd className="font-mono text-emerald-100">
                <a
                  className="underline decoration-emerald-700 hover:text-white"
                  href={`https://solscan.io/token/${hhMint.toBase58()}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {truncateAddr(hhMint.toBase58())}
                </a>
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
              <dt className="shrink-0 text-emerald-200/80">Merchant</dt>
              <dd className="font-mono text-emerald-100">
                <a
                  className="underline decoration-emerald-700 hover:text-white"
                  href={`https://solscan.io/account/${merchant.toBase58()}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {truncateAddr(merchant.toBase58())}
                </a>
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
              <dt className="shrink-0 text-emerald-200/80">
                {settlement.label} deposit (ATA)
              </dt>
              <dd className="break-all font-mono text-emerald-100/95">
                {truncateAddr(merchantSettlementAta.toBase58())}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-emerald-200/75">
            Merchants must have (or create) this SPL token account before the
            first payout; many wallets create it on first receive.
          </p>
        </div>
      )}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h3 className="text-base font-semibold text-zinc-100">
          Checkout (face value in stable SPL)
        </h3>
        <p className="mt-2 text-sm text-zinc-400">
          Choose settlement token and dollar face amount. The merchant receives
          that many units of the stable (6 decimals) if the route succeeds.
        </p>

        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Settlement token
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {STABLE_SETTLEMENTS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSettlementId(s.id);
                  setQuote(null);
                  setQuoteError(null);
                }}
                className={`rounded-full px-4 py-2 text-left text-sm font-medium transition ${
                  settlementId === s.id
                    ? "bg-violet-600 text-white"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                <span className="block">{s.label}</span>
                <span className="mt-0.5 block text-xs font-normal opacity-80">
                  {s.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {GIFT_DENOMS_USD.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDenom(d);
                setQuote(null);
                setQuoteError(null);
              }}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                denom === d
                  ? "bg-violet-600 text-white"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              ${d}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!hhMint || busy !== null}
            onClick={() => void runQuote()}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "quote" ? "Quoting…" : "Quote HH cost (ExactOut)"}
          </button>
        </div>

        {quoteError && (
          <p className="mt-4 text-sm text-red-400">{quoteError}</p>
        )}

        {quoteSummary && (
          <div className="mt-5 space-y-2 rounded-xl border border-zinc-700 bg-zinc-950/60 p-4 text-sm text-zinc-200">
            <p>
              <span className="text-zinc-500">
                {settlement.label} to merchant (face):{" "}
              </span>
              <span className="font-mono text-zinc-100">
                ≈ $
                {quoteSummary.settledDelivered.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </p>
            <p>
              <span className="text-zinc-500">Est. HH from your wallet: </span>
              <span className="font-mono text-zinc-100">
                {quoteSummary.hhIn.toLocaleString(undefined, {
                  maximumFractionDigits: hhDecimals > 8 ? 4 : 2,
                })}{" "}
                HH
              </span>
            </p>
            <p className="text-xs text-zinc-500">
              Jupiter <code className="text-zinc-400">ExactOut</code> is only
              supported on certain pool types; if quotes often fail, liquidity
              or routing is the constraint.
            </p>
          </div>
        )}

        <div className="mt-6">
          <button
            type="button"
            disabled={
              !connected ||
              !quote ||
              !configReady ||
              busy !== null ||
              !publicKey
            }
            onClick={() => void runPay()}
            className="w-full rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-8"
          >
            {busy === "pay"
              ? "Signing…"
              : `Pay with HH → ${settlement.label} to merchant`}
          </button>
          {!connected && (
            <p className="mt-2 text-xs text-zinc-500">
              Connect a wallet to sign the Jupiter transaction.
            </p>
          )}
        </div>

        {payError && (
          <p className="mt-3 text-sm text-red-400">{payError}</p>
        )}
        {txSig && (
          <p className="mt-3 text-sm text-emerald-400">
            Submitted:{" "}
            <a
              className="underline"
              href={`https://solscan.io/tx/${txSig}`}
              target="_blank"
              rel="noreferrer"
            >
              {txSig.slice(0, 12)}…
            </a>
          </p>
        )}
      </section>
    </div>
  );
}
