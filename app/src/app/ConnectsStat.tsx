"use client";

import { useEffect, useState } from "react";

// Stat tile: headline = wallets that have connected (self-reported via
// /api/connects), sub-line = on-chain payers (EOA requesters) + contract
// consumers, which is the verifiable number.
export default function ConnectsStat({
  payers,
  contracts,
}: {
  payers: number;
  contracts: number;
}) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/connects", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setCount(typeof j.count === "number" ? j.count : null))
      .catch(() => {});
  }, []);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground mb-1">Wallets connected</div>
      <div className="text-xl font-medium text-foreground">{count ?? "…"}</div>
      <div className="text-[11px] text-steel mt-0.5">
        {payers} payer{payers === 1 ? "" : "s"}
        {contracts > 0 ? ` · +${contracts} contract` : ""}
      </div>
    </div>
  );
}
