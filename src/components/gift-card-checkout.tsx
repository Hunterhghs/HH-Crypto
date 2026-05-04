"use client";

import {
  atomsToUsdc,
  buildSwapTransaction,
  hhAtomsToHuman,
  quoteExactOutHhToUsdc,
  usdcDollarsToAtoms,
  type JupiterQuoteResponse,
} from "@/lib/jupiter-exact-out";
import {
  getConfiguredHhMint,
  getHhDecimals,
  getMerchantWallet,
  USDC_MINT_MAINNET,
} from "@/lib/tokens";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction } from "@solana/web3.js";
import { useCallback, useMemo, useState } from "react";

const GIFT_DENOMS_USD = [5, 10, 25, 50, 100] as const;

export function GiftCardCheckout() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();
  const hhMint = useMemo(() => getConfiguredHhMint(), []);
  const merchant = useMemo(() => getMerchantWallet(), []);
  const hhDecimals = useMemo(() => getHhDecimals(), []);

  const merchantUsdcAta = useMemo(() => {
    if (!merchant) return null;
    try {
      return getAssociatedTokenAddressSync(USDC_MINT_MAINNET, merchant);
    } catch {
      return null;
    }
  }, [merchant]);

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
      const atoms = usdcDollarsToAtoms(denom);
      const q = await quoteExactOutHhToUsdc({
        hhMint: hhMint.toBase58(),
        exactOutUsdcAtoms: atoms,
      });
      setQuote(q);
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : "Quote failed");
    } finally {
      setBusy(null);
    }
  }, [hhMint, denom]);

  const runPay = useCallback(async () => {
    setPayError(null);
    setTxSig(null);
    if (!hhMint || !merchant || !merchantUsdcAta || !quote || !publicKey || !signTransaction) {
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
        destinationTokenAccount: merchantUsdcAta.toBase58(),
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
    merchantUsdcAta,
    quote,
    publicKey,
    signTransaction,
    connection,
  ]);

  const quoteSummary =
    quote && quote.inAmount && quote.outAmount
      ? {
          hhIn: hhAtomsToHuman(quote.inAmount, hhDecimals),
          usdcDelivered: atomsToUsdc(quote.outAmount),
        }
      : null;

  const configReady = Boolean(hhMint && merchant && merchantUsdcAta);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="rounded-2xl border border-amber-900/70 bg-amber-950/40 p-4 text-sm text-amber-100">
        <p className="font-medium text-amber-50">
          Executable value only — wallet “portfolio” totals can diverge massively.
        </p>
        <p className="mt-2 leading-relaxed text-amber-100/90">
          This page quotes a Jupiter route that delivers an exact USDC amount to
          your merchant wallet (gift-card style). If pools are thin, the HH cost
          will look enormous or the quote will fail — that is the market, not a
          UI bug. Fulfillment of third-party gift cards still requires your own
          ops (we only move USDC on-chain).
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
            {!hhMint && <li>NEXT_PUBLIC_HH_MINT</li>}
            {!merchant && <li>NEXT_PUBLIC_MERCHANT_WALLET (merchant Solana pubkey)</li>}
            {merchant && !merchantUsdcAta && (
              <li>Could not derive merchant USDC token account.</li>
            )}
          </ul>
          <p className="mt-2 opacity-90">
            For local dev, create{" "}
            <code className="rounded bg-black/30 px-1">.env.local</code> next to{" "}
            <code className="rounded bg-black/30 px-1">package.json</code>; restart{" "}
            <code className="rounded bg-black/30 px-1">npm run dev</code>. On Vercel,
            set env vars in the dashboard.
          </p>
        </div>
      )}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h3 className="text-base font-semibold text-zinc-100">
          Digital credit (priced in deliverable USDC)
        </h3>
        <p className="mt-2 text-sm text-zinc-400">
          Pick a denomination. Merchant receives exactly that much USDC (before
          your own bookkeeping / issuance of codes).
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
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
              <span className="text-zinc-500">USDC to merchant: </span>
              <span className="font-mono text-zinc-100">
                ${quoteSummary.usdcDelivered.toFixed(2)}
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
            {busy === "pay" ? "Signing…" : "Pay with HH (sign swap)"}
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

      {merchantUsdcAta && (
        <p className="text-center text-xs text-zinc-600">
          Merchant USDC ATA:{" "}
          <span className="font-mono">{merchantUsdcAta.toBase58()}</span>
        </p>
      )}
    </div>
  );
}
