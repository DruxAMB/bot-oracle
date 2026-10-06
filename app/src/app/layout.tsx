import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-jbmono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://botoracle.druxamb.dev"),
  title: "Bot Oracle · AI compute oracle on BOT Chain",
  description: "Live dashboard: requests, fulfillments, fees, and Sentinel autonomous reports.",
  openGraph: {
    title: "Bot Oracle · AI compute oracle on BOT Chain",
    description: "Paid AI inference oracle: contracts request on-chain, operators fulfill, results anchored on-chain. Live on BOT Chain mainnet.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@botoracle_",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className={`${mono.variable} font-sans`}>{children}</body>
    </html>
  );
}
