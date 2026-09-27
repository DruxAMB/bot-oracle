import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-jbmono",
});

export const metadata: Metadata = {
  title: "bot-oracle — AI compute oracle on BOT Chain",
  description: "Live dashboard: requests, fulfillments, fees, and Sentinel autonomous reports.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className={`${mono.variable} font-sans`}>{children}</body>
    </html>
  );
}
