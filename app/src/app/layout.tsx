import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "bot-oracle — AI compute oracle on BOT Chain",
  description: "Live dashboard: requests, fulfillments, fees, and Sentinel autonomous reports.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
