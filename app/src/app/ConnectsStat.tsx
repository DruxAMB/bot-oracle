"use client";

import { useEffect, useState } from "react";
import StatValue from "./StatValue";

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
    let dead = false;
    const load = () =>
      fetch("/api/connects", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (!dead) setCount(typeof j.count === "number" ? j.count : null);
        })
        .catch(() => {});
    load();
    // Wallet.tsx broadcasts the server's count after a new wallet connects.
    const on = (e: Event) => {
      const c = (e as CustomEvent<number>).detail;
      if (typeof c === "number") setCount(c);
      else load();
    };
    window.addEventListener("bo:connects", on);
    return () => {
      dead = true;
      window.removeEventListener("bo:connects", on);
    };
  }, []);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground mb-1">Connected users</div>
      <div className="text-xl font-medium text-foreground">
        <StatValue value={count == null ? "…" : String(count)} />
      </div>
      <div className="text-[11px] text-steel mt-0.5">
        <StatValue
          value={`${payers} payer${payers === 1 ? "" : "s"}${contracts > 0 ? ` · +${contracts} contract` : ""}`}
        />
      </div>
    </div>
  );
}
