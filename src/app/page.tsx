import { GiftCardCheckout } from "@/components/gift-card-checkout";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col px-4 py-12 sm:px-6">
      <header className="mx-auto mb-10 w-full max-w-2xl text-center">
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          H Heuristics — gift-card style checkout
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-pretty text-sm text-zinc-400">
          Live Jupiter <code className="text-zinc-300">ExactOut</code> quotes:
          HH settles to a chosen stable (USDC / USDT) in the merchant SPL
          account. Use it to gauge{" "}
          <span className="text-zinc-200">executable</span> cost — gift-card
          issuance is still a separate step.
        </p>
      </header>
      <GiftCardCheckout />
    </div>
  );
}
