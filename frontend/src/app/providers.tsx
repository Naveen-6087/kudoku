"use client";

import type { ReactNode } from "react";
import { PrivyProvider as PrivyAuthProvider, type PrivyClientConfig } from "@privy-io/react-auth";
import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { baseSepolia } from "viem/chains";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
const PRIVY_CLIENT_ID = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID ?? "";

const queryClient = new QueryClient();

const privyConfig: PrivyClientConfig = {
  appearance: {
    theme: "dark",
    accentColor: "#f4bf2a",
    landingHeader: "Enter Kudoku",
    loginMessage: "Connect with a wallet, WalletConnect QR, or social login to open a paid room.",
    showWalletLoginFirst: false,
    walletChainType: "ethereum-only",
    walletList: ["metamask", "rainbow", "wallet_connect", "detected_ethereum_wallets"]
  },
  loginMethods: ["email", "google", "discord", "github", "wallet"],
  defaultChain: baseSepolia,
  supportedChains: [baseSepolia]
};

export function AppProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const needsPrivy = pathname.startsWith("/play") || pathname.startsWith("/room");

  if (!needsPrivy || !PRIVY_APP_ID || !PRIVY_CLIENT_ID) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return (
    <PrivyAuthProvider appId={PRIVY_APP_ID} clientId={PRIVY_CLIENT_ID} config={privyConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </PrivyAuthProvider>
  );
}
