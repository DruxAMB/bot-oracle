import { loadDash, NET } from "@/lib/chain";
import { formatEther } from "ethers";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "bot-oracle — live network",
  description: "AI compute oracle on BOT Chain: live requests, fulfillments, fees and Sentinel reports.",
};

const short = (a: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const ago = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`) + " ago";

export default async function Home() {
  const d = await loadDash();

  const stats = [
    { label: "Requests served", value: String(d.totalRequests) },
    { label: "Fulfilled", value: String(d.fulfilled) },
    { label: "Protocol fees", value: `${Number(formatEther(d.feesWei)).toFixed(4)} BOT` },
    { label: "Operators", value: String(d.operatorCount) },
    { label: "Min stake", value: `${formatEther(d.minStake)} BOT` },
  ];

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-zinc-200 font-sans">
      <meta httpEquiv="refresh" content="20" />
      <div className="max-w-6xl mx-auto px-6 py-10">
        <header className="mb-8 flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">bot-oracle</h1>
            <p className="text-sm text-zinc-500">AI compute oracle · {NET.name} · block {d.block || "—"}</p>
          </div>
          {d.offline && <span className="text-amber-400 text-sm">RPC offline: {d.offline}</span>}
        </header>

        <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <div className="text-xs text-zinc-500 mb-1">{s.label}</div>
              <div className="text-xl font-medium text-white">{s.value}</div>
            </div>
          ))}
        </section>

        <section className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-5 mb-8">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-sm font-medium text-emerald-300">Sentinel — autonomous consumer</h2>
            <span className="text-xs text-zinc-500">
              {String(d.sentinelTicks)} ticks · last {ago(Math.floor(Date.now() / 1000) - d.sentinelReportAt)}
            </span>
          </div>
          <p className="text-zinc-300 text-sm leading-relaxed">{d.sentinelReport || "awaiting first report"}</p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Recent requests</h2>
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/70 text-zinc-500 text-xs">
                <tr>
                  <th className="text-left px-4 py-2 font-normal">#</th>
                  <th className="text-left px-4 py-2 font-normal">Requester</th>
                  <th className="text-left px-4 py-2 font-normal">Model</th>
                  <th className="text-left px-4 py-2 font-normal">Fee</th>
                  <th className="text-left px-4 py-2 font-normal">Status</th>
                  <th className="text-left px-4 py-2 font-normal">Age</th>
                </tr>
              </thead>
              <tbody>
                {d.requests.map((r) => (
                  <tr key={String(r.id)} className="border-t border-zinc-800/70">
                    <td className="px-4 py-2 text-zinc-300">{String(r.id)}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      <a className="text-sky-400 hover:underline" href={`${NET.explorer}/address/${r.requester}`}>{short(r.requester)}</a>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-zinc-400">{short(r.modelId)}</td>
                    <td className="px-4 py-2 text-zinc-400">{r.fee}</td>
                    <td className="px-4 py-2">
                      <span className={
                        r.status === "Fulfilled" ? "text-emerald-400" :
                        r.status === "Pending" ? "text-amber-400" : "text-zinc-500"
                      }>{r.status}</span>
                    </td>
                    <td className="px-4 py-2 text-zinc-500">{ago(r.ageSec)}</td>
                  </tr>
                ))}
                {d.requests.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-600">no requests yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="mt-10 text-xs text-zinc-600">
          coordinator <a className="text-sky-500 hover:underline" href={`${NET.explorer}/address/${NET.coordinator}`}>{short(NET.coordinator)}</a>
          {" · "}verified contracts · auto-refresh 20s
        </footer>
      </div>
    </main>
  );
}
