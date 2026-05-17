import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { AppProviders } from "./providers";

const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans"
});

const fontMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-mono"
});

const fontSerif = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif"
});

export const metadata: Metadata = {
  title: "Kudoku",
  description: "Gold-and-lava snake arena with Privy login, Base Sepolia escrow, and Noir/zkVerify proof flow."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html className={`${fontSans.variable} ${fontMono.variable} ${fontSerif.variable} dark`} lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
