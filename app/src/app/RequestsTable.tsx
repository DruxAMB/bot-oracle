"use client";

import { useState } from "react";
import { id } from "ethers";
import ResultModal from "./ResultModal";

// Rows come from the server with bigint ids already stringified.
export type FeedRow = {
  id: string;
  requester: string;
  modelId: string;
  fee: string;
  status: string;
  ageSec: number;
  operator: string | null;
  txHash: string | null;
  result: string | null;
  legacy?: boolean;
};

const PAGE_SIZE = 10;
const short = (a: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const ago = (s: number) =>
  (s < 0 ? "now" : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`);
const KNOWN_MODELS: Record<string, string> = Object.fromEntries(
  ["echo:v1", "sentinel:v1", "gpt-4o-mini:v1"].map((l) => [id(l).toLowerCase(), l])
);

// Windowed page list: [1, …, c-1, c, c+1, …, last] with ellipsis markers.
function pageList(page: number, count: number): (number | "…")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const set = new Set([1, count, page - 1, page, page + 1].filter((p) => p >= 1 && p <= count));
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of [...set].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

export default function RequestsTable({
  rows,
  capped,
  explorer,
  coordinator,
}: {
  rows: FeedRow[];
  capped: number;
  explorer: string;
  coordinator: string;
}) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const cur = Math.min(page, pageCount);
  const slice = rows.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);

  const ext = (href: string, text: string, className = "text-secondary underline decoration-dotted underline-offset-2 hover:text-foreground") => (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {text}
    </a>
  );
  const btn = (label: string | number, target: number, active = false, disabled = false) => (
    <button
      key={label}
      type="button"
      disabled={disabled}
      onClick={() => setPage(target)}
      aria-current={active ? "page" : undefined}
      className={`rounded border px-2 py-0.5 disabled:opacity-40 ${
        active ? "border-primary text-foreground" : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
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
            {slice.map((r) => (
              <tr key={`${r.legacy ? "v1" : "v3"}-${r.id}`} className="border-t border-border align-top">
                <td className="px-4 py-2 text-secondary">
                  {r.id}
                  {r.legacy && (
                    <span className="ml-1.5 text-[10px] text-steel border border-border rounded px-1 py-0.5 align-middle">v1</span>
                  )}
                </td>
                <td className="px-4 py-2 font-mono text-xs">
                  {ext(`${explorer}/address/${r.requester}`, short(r.requester))}
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
                    <ResultModal requestId={r.legacy ? `${r.id} (v1)` : r.id} result={r.result} />
                  )}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{ago(r.ageSec)}</td>
                <td className="px-4 py-2 font-mono text-xs">
                  {r.txHash ? ext(`${explorer}/tx/${r.txHash}`, short(r.txHash)) : "-"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr className="border-t border-border">
                <td colSpan={7} className="px-4 py-8 text-center text-steel">
                  No requests in the scanned window; the feed fills as Sentinel ticks land.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > 0 && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            {rows.length} requests · ids restart per coordinator
            {capped > 0 && (
              <> · earliest {capped} not shown — {ext(`${explorer}/address/${coordinator}`, "explorer ↗")}</>
            )}
          </span>
          {pageCount > 1 && (
            <nav aria-label="Request pages" className="flex items-center gap-1.5">
              {btn("‹ prev", cur - 1, false, cur === 1)}
              {pageList(cur, pageCount).map((p, i) =>
                p === "…" ? (
                  <span key={`e${i}`} className="px-1 text-muted-foreground">…</span>
                ) : (
                  btn(p, p, p === cur)
                )
              )}
              {btn("next ›", cur + 1, false, cur === pageCount)}
            </nav>
          )}
        </div>
      )}
    </>
  );
}
