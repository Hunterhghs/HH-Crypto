"use client";

import { createSolanaClient } from "@metamask/connect-solana";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import { useEffect, useMemo, type ReactNode } from "react";
import "@solana/wallet-adapter-react-ui/styles.css";

export function SolanaProviders({ children }: { children: ReactNode }) {
  const network = WalletAdapterNetwork.Mainnet;

  const endpoint = useMemo(
    () =>
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
      clusterApiUrl(network === WalletAdapterNetwork.Mainnet ? "mainnet-beta" : "devnet"),
    [network],
  );

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  useEffect(() => {
    void (async () => {
      const rpc =
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
        clusterApiUrl("mainnet-beta");
      await createSolanaClient({
        dapp: {
          name: "HH Gift Checkout",
          url: window.location.origin,
        },
        api: {
          supportedNetworks: {
            mainnet: rpc,
          },
        },
      });
    })();
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
