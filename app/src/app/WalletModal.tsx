"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Dialog, { DialogHeader } from "./Dialog";
import { useWallet } from "./Wallet";
import {
  CANONICAL,
  getWallets,
  subscribeWallets,
  type AnnouncedWallet,
  type Eip1193Provider,
} from "../lib/wallets";

function WalletRow({
  icon,
  name,
  hint,
  busy,
  disabled,
  onClick,
}: {
  icon?: string;
  name: string;
  hint: string;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-lg border border-border px-3.5 py-3 text-left hover:border-secondary hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary transition-colors disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-transparent"
    >
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt="" aria-hidden className="h-6 w-6 rounded" />
      ) : (
        <span
          aria-hidden
          className="flex h-6 w-6 items-center justify-center rounded border border-border-strong font-mono text-xs text-primary"
        >
          ›_
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-foreground">{name}</span>
        <span className={`block truncate text-xs ${busy ? "text-warning" : "text-muted-foreground"}`}>
          {busy ? "approve in wallet…" : hint}
        </span>
      </span>
      <span aria-hidden className="text-xs text-steel">{busy ? "…" : "→"}</span>
    </button>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-steel">{label}</div>
        <div className="truncate font-mono text-xs text-secondary" title={value}>
          {value}
        </div>
      </div>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-secondary focus-visible:outline-2 focus-visible:outline-primary"
      >
        {copied ? "copied ✓" : "copy"}
      </button>
    </div>
  );
}

export default function WalletModal({ onClose }: { onClose: () => void }) {
  const wallets = useSyncExternalStore(subscribeWallets, getWallets, () => [] as AnnouncedWallet[]);
  const { connect, status, connectError, chain } = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Modal stays open while the wallet prompt is out: row shows "approve in
  // wallet…", inline errors surface here, success (ready) or wrong-chain
  // auto-closes so the header's switch-network button takes over.
  useEffect(() => {
    if (status === "ready" || status === "wrongChain") onCloseRef.current();
    if (status !== "connecting") setBusy(null);
  }, [status]);

  const pick = (key: string, p: Eip1193Provider) => {
    if (status === "connecting") return;
    setBusy(key);
    void connect(p);
  };

  const injected: Eip1193Provider | undefined =
    typeof window !== "undefined" ? (window as any).ethereum : undefined;

  const canonicalRows = CANONICAL.map((c) => ({
    ...c,
    found: wallets.find((w) => w.info.rdns === c.rdns),
  }));
  const extras = wallets.filter(
    (w) => !CANONICAL.some((c) => c.rdns === w.info.rdns)
  );
  // window.ethereum already covered by an announced wallet (same provider)
  const injectedDup = injected && wallets.some((w) => w.provider === injected);
  const connecting = status === "connecting";

  return (
    <Dialog onClose={onClose} labelId="wallet-h">
      <DialogHeader id="wallet-h" title="Connect wallet" onClose={onClose} />
      <p className="mb-3 text-xs text-muted-foreground">
        Pick the wallet to sign with. BOT Chain mainnet, chain 677.
      </p>
      <div className="space-y-2">
        {canonicalRows.map((c) => {
          const found = c.found;
          return found ? (
            <WalletRow
              key={c.rdns}
              icon={found.info.icon}
              name={found.info.name}
              hint="detected"
              busy={busy === c.rdns}
              disabled={connecting}
              onClick={() => pick(c.rdns, found.provider)}
            />
          ) : (
            <a
              key={c.rdns}
              href={c.install}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center gap-3 rounded-lg border border-border px-3.5 py-3 text-left hover:border-secondary hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary transition-colors"
            >
              <span
                aria-hidden
                className="flex h-6 w-6 items-center justify-center rounded border border-border-strong font-mono text-xs text-muted-foreground"
              >
                ›_
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-secondary">{c.name}</span>
                <span className="block text-xs text-steel">not installed · get it ↗</span>
              </span>
            </a>
          );
        })}

        {extras.map((w) => (
          <WalletRow
            key={w.info.uuid}
            icon={w.info.icon}
            name={w.info.name}
            hint="detected"
            busy={busy === w.info.uuid}
            disabled={connecting}
            onClick={() => pick(w.info.uuid, w.provider)}
          />
        ))}

        {injected && !injectedDup && (
          <WalletRow
            name="Browser wallet"
            hint="use the injected provider"
            busy={busy === "injected"}
            disabled={connecting}
            onClick={() => pick("injected", injected)}
          />
        )}
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={() => setShowManual((s) => !s)}
          aria-expanded={showManual}
          className="w-full rounded-lg border border-dashed border-border-strong px-3.5 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:border-secondary hover:text-secondary focus-visible:outline-2 focus-visible:outline-primary"
        >
          Add {chain.name} to your wallet manually{" "}
          <span aria-hidden className="text-steel">{showManual ? "▴" : "▾"}</span>
        </button>
        {showManual && (
          <div className="mt-2 space-y-2.5 rounded-lg border border-border p-3">
            <CopyRow label="Network name" value={chain.name} />
            <CopyRow label="Chain ID" value={String(chain.id)} />
            <CopyRow label="Chain ID (hex)" value={chain.hexId} />
            <CopyRow label="RPC URL" value={chain.rpc} />
            <CopyRow label="Currency symbol" value={chain.symbol} />
            <CopyRow label="Block explorer" value={chain.explorer} />
            <p className="pt-1 text-[11px] leading-relaxed text-steel">
              In your wallet: Settings → Networks → Add network manually, then
              paste each field.
            </p>
          </div>
        )}
      </div>

      {connectError && (
        <p className="mt-3 text-xs text-warning" role="alert">
          {connectError}
        </p>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-steel">
        Wallet connects via EIP-6963 / window.ethereum. You can switch networks inside
        the wallet; we prompt a network switch if you land on the wrong chain.
      </p>
    </Dialog>
  );
}
