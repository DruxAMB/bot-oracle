import Dashboard from "./Dashboard";

export const metadata = {
  title: "bot-oracle | live network",
  description: "AI compute oracle on BOT Chain: live requests, fulfillments, fees and Sentinel reports.",
};

// Static export: the dashboard data loads client-side in <Dashboard/> straight
// from the public RPC — this file intentionally contains no server fetch.
export default function Home() {
  return <Dashboard />;
}
