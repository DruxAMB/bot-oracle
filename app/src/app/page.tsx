import { loadDash, NET } from "@/lib/chain";
import { formatEther, id } from "ethers";
import Playground from "./Playground";
import AutoRefresh from "./AutoRefresh";
import ConnectsStat from "./ConnectsStat";
import { WalletProvider, ConnectWalletButton } from "./Wallet";
import Toaster from "./Toaster";
import CopyCommand from "./CopyCommand";
import Markdown from "./Markdown";
import ResultModal from "./ResultModal";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "bot-oracle | live network",
  description: "AI compute oracle on BOT Chain: live requests, fulfillments, fees and Sentinel reports.",
};

const short = (a: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const ago = (s: number) =>
  (s < 0 ? "now" : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`);

const ext = (href: string, text: string, className = "text-secondary underline decoration-dotted underline-offset-2 hover:text-foreground") => (
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

  const hasLegacy = d.legacyRequests > 0n;
  const stats = [
    {
      label: "Requests served",
      value: String(d.totalRequests + d.legacyRequests),
      sub: hasLegacy ? `${d.totalRequests} on v3 · ${d.legacyRequests} on v1` : "",
    },
    { label: "Fulfilled", value: String(d.fulfilled + d.legacyFulfilled), sub: "" },
    {
      label: "Protocol fees",
      value: `${Number(formatEther(d.feesWei + d.legacyFeesWei)).toFixed(4)} BOT`,
      sub: hasLegacy ? "across v1 + v2" : "10% of each query",
    },
    { label: "Operators", value: String(d.operatorCount), sub: "" },
    { label: "Min stake", value: `${formatEther(d.minStake)} BOT`, sub: "" },
  ];

  const deployments = [
    { name: "OracleCoordinator", addr: NET.coordinator },
    { name: "ModelRegistry", addr: NET.models },
    { name: "OperatorRegistry", addr: NET.registry },
    { name: "Sentinel (consumer)", addr: NET.sentinel },
    ...(NET.legacyCoordinator !== "0x0000000000000000000000000000000000000000"
      ? [{ name: "OracleCoordinator v1 (superseded)", addr: NET.legacyCoordinator }]
      : []),
  ];

  return (
    <main className="min-h-screen bg-surface text-foreground font-sans">
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
              <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-foreground">
                <svg width="28" height="28" viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
                  <rect width="48" height="48" rx="2" fill="#0a0a0a"/>
                  <rect width="48" height="48" rx="2" fill="none" stroke="#3a3a3a" strokeWidth="1.5"/>
                  <rect x="3" y="8" width="2" height="32" fill="#da5c2c"/>
                  <path d="M15 15.5 L23.5 24 L15 32.5" fill="none" stroke="#eeeeee" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="27" y1="32.5" x2="38" y2="32.5" stroke="#eeeeee" strokeWidth="3" strokeLinecap="round"/>
                </svg>
                bot-oracle
              </h1>
              <p className="text-sm text-muted-foreground">
                AI compute oracle · {NET.name} · block {d.block || "-"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {d.offline ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-warning bg-card px-3 py-1 text-xs text-warning">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warning" />
                  RPC offline: {d.offline}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
                  live · refreshes every 60s
                </span>
              )}
              <ConnectWalletButton />
            </div>
          </header>

        <section aria-label="network stats" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {stats.slice(0, 2).map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
              <div className="text-xl font-medium text-foreground">{s.value}</div>
              {s.sub && <div className="text-[11px] text-steel mt-0.5">{s.sub}</div>}
            </div>
          ))}
          <ConnectsStat payers={d.uniquePayers} contracts={d.contractConsumers} />
          {stats.slice(2).map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
              <div className="text-xl font-medium text-foreground">{s.value}</div>
              {s.sub && <div className="text-[11px] text-steel mt-0.5">{s.sub}</div>}
            </div>
          ))}
        </section>

        <section aria-labelledby="sentinel-h" className="category-mark rounded-lg border border-border bg-card mb-8">
          <details className="group">
            <summary className="flex flex-wrap items-baseline justify-between gap-2 p-5 pb-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden rounded-lg focus-visible:outline-2 focus-visible:outline-primary">
              <h2 id="sentinel-h" className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <span aria-hidden className="inline-block text-steel transition-transform group-open:rotate-90">›</span>
                Sentinel · autonomous consumer
              </h2>
              <span className="text-xs text-muted-foreground">
                {String(d.sentinelTicks)} ticks ·
                {d.sentinelReportAt ? ` last report ${ago(now - d.sentinelReportAt)}` : " no reports yet"} ·
                {nextTickIn != null && ` next tick in ~${Math.ceil(nextTickIn / 60)}m`} ·
                {d.sentinelQueryPrice > 0n && d.sentinelBalance < d.sentinelQueryPrice
                  ? "purse empty - needs top-up to keep ticking"
                  : `balance ${Number(formatEther(d.sentinelBalance)).toFixed(3)} BOT`}
              </span>
            </summary>
            <div className="px-5 pb-5">
              {d.sentinelReport ? (
                <Markdown>{d.sentinelReport}</Markdown>
              ) : (
                <p className="text-secondary text-sm leading-relaxed">
                  {"Awaiting first report; Sentinel ticks every " + Math.round(d.sentinelMinInterval / 60) + " minutes and stores each result here."}
                </p>
              )}
              <p className="mt-3 text-xs text-steel">
                Every cycle is a paid oracle request; the product generates its own on-chain demand.{" "}
                {ext(`${NET.explorer}/address/${NET.sentinel}`, "contract ↗")}
              </p>
            </div>
          </details>
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
          <section aria-labelledby="models-h" className="min-w-0 rounded-lg border border-border p-5">
            <h2 id="models-h" className="text-sm font-medium text-secondary mb-3">Models</h2>
            {d.models.length === 0 ? (
              <p className="text-sm text-steel">No models registered.</p>
            ) : (
              <ul className="space-y-3">
                {d.models.map((m) => (
                  <li key={m.modelId} className="text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-xs text-secondary">
                        {KNOWN_MODELS[m.modelId.toLowerCase()] ?? short(m.modelId)}
                      </span>
                      <span className={m.active ? "text-xs text-success" : "text-xs text-steel"}>
                        {m.active ? "active" : "inactive"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      backend <span className="font-mono">{m.backend}</span> · {formatEther(m.priceWei)} BOT/query
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="ops-h" className="min-w-0 rounded-lg border border-border p-5">
            <h2 id="ops-h" className="text-sm font-medium text-secondary mb-3">Operators</h2>
            {d.operators.length === 0 ? (
              <p className="text-sm text-steel">No operators registered.</p>
            ) : (
              <ul className="space-y-3">
                {d.operators.map((o) => (
                  <li key={o.address} className="text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      {ext(`${NET.explorer}/address/${o.address}`, short(o.address), "font-mono text-xs text-secondary hover:underline")}
                      <span className={o.active ? "text-xs text-success" : "text-xs text-warning"}>
                        {o.active ? "active" : "unstaking"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      stake {formatEther(o.stake)} BOT{o.endpoint ? ` · ${o.endpoint}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section aria-labelledby="feed-h" className="mb-8">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 id="feed-h" className="text-sm font-medium text-secondary">Recent requests</h2>
            {ext(
              `${NET.explorer}/address/${NET.coordinator}`,
              "view all on explorer ↗",
              "text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-secondary"
            )}
          </div>
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-elevated text-muted-foreground text-xs">
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
                  <tr key={`${r.legacy ? "v1" : "v3"}-${String(r.id)}`} className="border-t border-border align-top">
                    <td className="px-4 py-2 text-secondary">
                      {String(r.id)}
                      {r.legacy && (
                        <span className="ml-1.5 text-[10px] text-steel border border-border rounded px-1 py-0.5 align-middle">v1</span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {ext(`${NET.explorer}/address/${r.requester}`, short(r.requester))}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-secondary">
                      {KNOWN_MODELS[r.modelId.toLowerCase()] ?? short(r.modelId)}
                    </td>
                    <td className="px-4 py-2 text-secondary">{r.fee}</td>
                    <td className="px-4 py-2">
                      <span className={
                        r.status === "Fulfilled" ? "text-success" :
                        r.status === "Pending" ? "text-warning" : "text-muted-foreground"
                      }>
                        {r.status}
                      </span>
                      {r.result && (
                        <ResultModal requestId={r.legacy ? `${r.id} (v1)` : r.id.toString()} result={r.result} />
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{ago(r.ageSec)}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {r.txHash ? ext(`${NET.explorer}/tx/${r.txHash}`, short(r.txHash)) : "-"}
                    </td>
                  </tr>
                ))}
                {d.requests.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-steel">
                      No requests in the scanned window; the feed fills as Sentinel ticks land.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mb-8">
          <section aria-labelledby="integrate-h" className="min-w-0 rounded-lg border border-border p-5">
            <h2 id="integrate-h" className="text-sm font-medium text-secondary mb-3">Use the oracle</h2>
            <p className="text-xs text-muted-foreground mb-2">HTTP gateway · one call, on-chain round trip (run your own: <code className="text-steel">gateway/</code> in the repo):</p>
            <pre className="overflow-x-auto rounded bg-background border border-border p-3 text-xs text-secondary">{`curl -X POST http://localhost:8791/v1/query \\
  -H 'content-type: application/json' \\
  -H 'x-api-key: <issued-key>' \\
  -d '{"model":"echo:v1","prompt":"hello"}'`}</pre>
            <p className="text-xs text-muted-foreground mt-3 mb-2">JS SDK (registry publish pending; install from the repo tarball):</p>
            <div className="mb-2">
              <CopyCommand cmd="npm i https://raw.githubusercontent.com/DruxAMB/bot-oracle/main/dist/bot-oracle-sdk-0.1.1.tgz" />
            </div>
            <pre className="overflow-x-auto rounded bg-background border border-border p-3 text-xs text-secondary">{`import { OracleClient } from "@bot-oracle/sdk";
const o = new OracleClient({ rpcUrl, chainId: 677, coordinator, models, signer });
const value = await o.priceOf(OracleClient.modelId("echo:v1"));
const { requestId } = await o.request({ modelId: OracleClient.modelId("echo:v1"), prompt: "hello", value });
await o.awaitResult(requestId);
const text = await o.getResult(requestId);`}</pre>
          </section>
        </div>

        <footer className="border-t border-border pt-5 text-xs text-steel">
          <div className="mb-4" aria-labelledby="deploy-h">
            <div id="deploy-h" className="mb-2 text-muted-foreground">
              Deployments · verified on explorer
            </div>
            <ul className="grid gap-x-10 gap-y-1.5 sm:grid-cols-2">
              {deployments.map((x) => (
                <li key={x.addr} className="flex items-baseline justify-between gap-2">
                  <span className="text-secondary">{x.name}</span>
                  {ext(`${NET.explorer}/address/${x.addr}`, short(x.addr), "font-mono text-secondary underline decoration-dotted underline-offset-2 hover:text-foreground")}
                </li>
              ))}
            </ul>
            <p className="mt-2.5">
              Chain {NET.chainId} · all four core contracts source-verified on Blockscout.
            </p>
          </div>
          Server-rendered from {NET.rpc} · single trusted operator (v1) ·{" "}
          <a href="/whitepaper" className="text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-secondary">
            whitepaper
          </a>{" "}·{" "}
          {ext("https://github.com/DruxAMB/bot-oracle", "source ↗", "text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-secondary")}
          <div className="mt-2">
            Built on{" "}
            {ext("https://botchain.ai", "BOT Chain ↗", "text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-secondary")}
            {" "}·{" "}
            {ext("https://scan.botchain.ai", "mainnet explorer ↗", "text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-secondary")}
            {" "}·{" "}
            {ext("https://x.com/botoracle_", "@botoracle_ ↗", "text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-secondary")}
          </div>
        </footer>
        </div>
        <Toaster />
      </WalletProvider>
    </main>
  );
}
