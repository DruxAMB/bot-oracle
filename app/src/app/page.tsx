import { loadDash, NET } from "@/lib/chain";
import { formatEther, id } from "ethers";
import Playground from "./Playground";
import AutoRefresh from "./AutoRefresh";
import { WalletProvider, ConnectWalletButton } from "./Wallet";
import Markdown from "./Markdown";
import ResultModal from "./ResultModal";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "bot-oracle — live network",
  description: "AI compute oracle on BOT Chain: live requests, fulfillments, fees and Sentinel reports.",
};

const short = (a: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const ago = (s: number) =>
  (s < 0 ? "now" : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`);

const ext = (href: string, text: string, className = "text-sky-400 hover:underline") => (
  <a className={className} href={href} target="_blank" rel="noopener noreferrer">
    {text}
  </a>
);

// modelIds are keccak256(label); label any conventionally-named model
const KNOWN_MODELS: Record<string, string> = Object.fromEntries(
  ["echo:v1", "sentinel:v1", "gpt-4o-mini:v1"].map((l) => [id(l).toLowerCase(), l])
);

export default async function Home() {
  const d = await loadDash();
  const now = Math.floor(Date.now() / 1000);
  const nextTickIn = d.sentinelLastTickAt
    ? Math.max(0, d.sentinelLastTickAt + d.sentinelMinInterval - now)
    : null;

  const stats = [
    {
      label: "Requests served",
      value: String(d.totalRequests + d.legacyRequests),
      sub: `${d.totalRequests} on v2 · ${d.legacyRequests} on v1`,
    },
    { label: "Fulfilled", value: String(d.fulfilled + d.legacyFulfilled), sub: "" },
    {
      label: "Protocol fees",
      value: `${Number(formatEther(d.feesWei + d.legacyFeesWei)).toFixed(4)} BOT`,
      sub: "across v1 + v2",
    },
    { label: "Operators", value: String(d.operatorCount), sub: "" },
    { label: "Min stake", value: `${formatEther(d.minStake)} BOT`, sub: "" },
  ];

  const deployments = [
    { name: "OracleCoordinator", addr: NET.coordinator },
    { name: "ModelRegistry", addr: NET.models },
    { name: "OperatorRegistry", addr: NET.registry },
    { name: "Sentinel (consumer)", addr: NET.sentinel },
    { name: "OracleCoordinator v1 (superseded)", addr: NET.legacyCoordinator },
  ];

  return (
    <main className="min-h-screen bg-surface text-zinc-200 font-sans">
      <AutoRefresh intervalMs={60_000} />
      <WalletProvider
        chainId={NET.chainId}
        chainName={NET.name}
        rpc={NET.rpc}
        explorer={NET.explorer}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <header className="mb-8 flex flex-wrap items-center gap-3 justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-white">bot-oracle</h1>
              <p className="text-sm text-zinc-500">
                AI compute oracle · {NET.name} · block {d.block || "—"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {d.offline ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-800 bg-amber-950/40 px-3 py-1 text-xs text-amber-300">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  RPC offline — {d.offline}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-800 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-300">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  live · refreshes every 60s
                </span>
              )}
              <ConnectWalletButton />
            </div>
          </header>

        <section aria-label="network stats" className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <div className="text-xs text-zinc-500 mb-1">{s.label}</div>
              <div className="text-xl font-medium text-white">{s.value}</div>
              {s.sub && <div className="text-[11px] text-zinc-600 mt-0.5">{s.sub}</div>}
            </div>
          ))}
        </section>

        <section aria-labelledby="sentinel-h" className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-5 mb-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <h2 id="sentinel-h" className="text-sm font-medium text-emerald-300">
              Sentinel — autonomous consumer
            </h2>
            <span className="text-xs text-zinc-500">
              {String(d.sentinelTicks)} ticks ·
              {d.sentinelReportAt ? ` last report ${ago(now - d.sentinelReportAt)}` : " no reports yet"} ·
              {nextTickIn != null && ` next tick in ~${Math.ceil(nextTickIn / 60)}m`} ·
              balance {Number(formatEther(d.sentinelBalance)).toFixed(3)} BOT
            </span>
          </div>
          {d.sentinelReport ? (
            <Markdown>{d.sentinelReport}</Markdown>
          ) : (
            <p className="text-zinc-300 text-sm leading-relaxed">
              {"Awaiting first report — Sentinel ticks every " + Math.round(d.sentinelMinInterval / 60) + " minutes and stores each result here."}
            </p>
          )}
          <p className="mt-3 text-xs text-zinc-600">
            Every cycle is a paid oracle request — the product generates its own on-chain demand.{" "}
            {ext(`${NET.explorer}/address/${NET.sentinel}`, "contract ↗")}
          </p>
        </section>

        <Playground
          coordinator={NET.coordinator}
          chainId={NET.chainId}
          rpc={NET.rpc}
          explorer={NET.explorer}
          models={d.models.filter((m) => m.active).map((m) => ({
            modelId: m.modelId,
            label: KNOWN_MODELS[m.modelId.toLowerCase()] ?? short(m.modelId),
            backend: m.backend,
            priceWei: m.priceWei.toString(),
            active: m.active,
          }))}
        />

        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <section aria-labelledby="models-h" className="rounded-lg border border-zinc-800 p-5">
            <h2 id="models-h" className="text-sm font-medium text-zinc-400 mb-3">Models</h2>
            {d.models.length === 0 ? (
              <p className="text-sm text-zinc-600">No models registered.</p>
            ) : (
              <ul className="space-y-3">
                {d.models.map((m) => (
                  <li key={m.modelId} className="text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-xs text-zinc-300">
                        {KNOWN_MODELS[m.modelId.toLowerCase()] ?? short(m.modelId)}
                      </span>
                      <span className={m.active ? "text-xs text-emerald-400" : "text-xs text-zinc-600"}>
                        {m.active ? "active" : "inactive"}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500">
                      backend <span className="font-mono">{m.backend}</span> · {formatEther(m.priceWei)} BOT/query
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="ops-h" className="rounded-lg border border-zinc-800 p-5">
            <h2 id="ops-h" className="text-sm font-medium text-zinc-400 mb-3">Operators</h2>
            {d.operators.length === 0 ? (
              <p className="text-sm text-zinc-600">No operators registered.</p>
            ) : (
              <ul className="space-y-3">
                {d.operators.map((o) => (
                  <li key={o.address} className="text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      {ext(`${NET.explorer}/address/${o.address}`, short(o.address), "font-mono text-xs text-sky-400 hover:underline")}
                      <span className={o.active ? "text-xs text-emerald-400" : "text-xs text-amber-400"}>
                        {o.active ? "active" : "unstaking"}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500">
                      stake {formatEther(o.stake)} BOT{o.endpoint ? ` · ${o.endpoint}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section aria-labelledby="feed-h" className="mb-8">
          <h2 id="feed-h" className="text-sm font-medium text-zinc-400 mb-3">Recent requests</h2>
          <div className="rounded-lg border border-zinc-800 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-zinc-900/70 text-zinc-500 text-xs">
                <tr>
                  <th scope="col" className="text-left px-4 py-2 font-normal">#</th>
                  <th scope="col" className="text-left px-4 py-2 font-normal">Requester</th>
                  <th scope="col" className="text-left px-4 py-2 font-normal">Model</th>
                  <th scope="col" className="text-left px-4 py-2 font-normal">Fee</th>
                  <th scope="col" className="text-left px-4 py-2 font-normal">Status</th>
                  <th scope="col" className="text-left px-4 py-2 font-normal">Age</th>
                  <th scope="col" className="text-left px-4 py-2 font-normal">Tx</th>
                </tr>
              </thead>
              <tbody>
                {d.requests.map((r) => (
                  <tr key={String(r.id)} className="border-t border-zinc-800/70 align-top">
                    <td className="px-4 py-2 text-zinc-300">{String(r.id)}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {ext(`${NET.explorer}/address/${r.requester}`, short(r.requester))}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-zinc-400">
                      {KNOWN_MODELS[r.modelId.toLowerCase()] ?? short(r.modelId)}
                    </td>
                    <td className="px-4 py-2 text-zinc-400">{r.fee}</td>
                    <td className="px-4 py-2">
                      <span className={
                        r.status === "Fulfilled" ? "text-emerald-400" :
                        r.status === "Pending" ? "text-amber-400" : "text-zinc-500"
                      }>
                        {r.status}
                      </span>
                      {r.result && (
                        <ResultModal requestId={r.id.toString()} result={r.result} />
                      )}
                    </td>
                    <td className="px-4 py-2 text-zinc-500">{ago(r.ageSec)}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {ext(`${NET.explorer}/tx/${r.txHash}`, short(r.txHash))}
                    </td>
                  </tr>
                ))}
                {d.requests.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-zinc-600">
                      No requests in the scanned window — the feed fills as Sentinel ticks land.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <section aria-labelledby="integrate-h" className="rounded-lg border border-zinc-800 p-5">
            <h2 id="integrate-h" className="text-sm font-medium text-zinc-400 mb-3">Use the oracle</h2>
            <p className="text-xs text-zinc-500 mb-2">HTTP gateway — one call, on-chain round trip:</p>
            <pre className="overflow-x-auto rounded bg-zinc-950 border border-zinc-800/70 p-3 text-xs text-zinc-300">{`curl -X POST http://localhost:8791/v1/query \\
  -H 'content-type: application/json' \\
  -H 'x-api-key: <issued-key>' \\
  -d '{"model":"echo:v1","prompt":"hello"}'`}</pre>
            <p className="text-xs text-zinc-500 mt-3 mb-2">JS SDK:</p>
            <pre className="overflow-x-auto rounded bg-zinc-950 border border-zinc-800/70 p-3 text-xs text-zinc-300">{`import { OracleClient } from "@bot-oracle/sdk";
const o = new OracleClient({ rpcUrl, chainId: 968, coordinator, models, signer });
const value = await o.priceOf(OracleClient.modelId("echo:v1"));
const { requestId } = await o.request({ modelId: OracleClient.modelId("echo:v1"), prompt: "hello", value });
await o.awaitResult(requestId);
const text = await o.getResult(requestId);`}</pre>
          </section>

          <section aria-labelledby="deploy-h" className="rounded-lg border border-zinc-800 p-5">
            <h2 id="deploy-h" className="text-sm font-medium text-zinc-400 mb-3">
              Deployments — verified on explorer
            </h2>
            <ul className="space-y-2">
              {deployments.map((x) => (
                <li key={x.addr} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-zinc-400">{x.name}</span>
                  {ext(`${NET.explorer}/address/${x.addr}`, short(x.addr), "font-mono text-xs text-sky-400 hover:underline")}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-zinc-600">
              Chain {NET.chainId} · all four core contracts source-verified on Blockscout.
            </p>
          </section>
        </div>

        <footer className="text-xs text-zinc-600">
          Server-rendered from {NET.rpc} · single trusted operator (v1) ·{" "}
          {ext("https://github.com/DruxAMB/bot-oracle", "source ↗", "text-zinc-500 hover:underline")}
        </footer>
        </div>
      </WalletProvider>
    </main>
  );
}
