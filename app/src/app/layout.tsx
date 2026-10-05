import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-jbmono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://bot-oracle.druxamb.dev"),
  title: "Bot Oracle · AI compute oracle on BOT Chain",
  description: "Live dashboard: requests, fulfillments, fees, and Sentinel autonomous reports.",
  openGraph: {
    title: "Bot Oracle · AI compute oracle on BOT Chain",
    description: "Paid AI inference oracle: contracts request on-chain, operators fulfill, results anchored on-chain. Live on BOT Chain mainnet.",
    images: [{ url: "/logo-banner.png", width: 1520, height: 192 }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className={`${mono.variable} font-sans`}>{children}</body>
    </html>
  );
}
