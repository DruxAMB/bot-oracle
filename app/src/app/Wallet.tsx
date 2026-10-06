"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BrowserProvider, formatEther } from "ethers";
import { toast } from "sonner";
import WalletModal from "./WalletModal";
import { findWallet, getWallets, type Eip1193Provider } from "../lib/wallets";

export type WalletStatus = "idle" | "connecting" | "noWallet" | "wrongChain" | "ready";

interface WalletCtxValue {
  status: WalletStatus;
  address: string;
  balance: bigint;
  connectError: string;
  /** Chain params - shown by the modal's manual add-network details. */
  chain: { name: string; id: number; hexId: string; rpc: string; explorer: string; symbol: string };
  /** The EIP-1193 provider the user picked (or window.ethereum default). */
  provider: Eip1193Provider | undefined;
  connect(provider?: Eip1193Provider): Promise<void>;
  disconnect(): void;
  openWalletModal(): void;
  switchChain(): Promise<void>;
  refresh(): Promise<WalletStatus>;
}

const WalletContext = createContext<WalletCtxValue>({
  status: "idle",
  address: "",
  balance: 0n,
  connectError: "",
  chain: { name: "", id: 0, hexId: "0x0", rpc: "", explorer: "", symbol: "" },
  provider: undefined,
  connect: async () => {},
  disconnect: () => {},
  openWalletModal: () => {},
  switchChain: async () => {},
  refresh: async () => "idle" as WalletStatus,
});

export const useWallet = () => useContext(WalletContext);

const injected = (): Eip1193Provider | undefined =>
  typeof window !== "undefined" ? (window as any).ethereum : undefined;
const short = (a: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const LS_KEY = "bo:wallet";

export function WalletProvider({
  chainId,
  chainName,
  rpc,
  explorer,
  children,
}: {
  chainId: number;
  chainName: string;
  rpc: string;
  explorer: string;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<WalletStatus>("idle");
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState(0n);
  const [connectError, setConnectError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [provider, setProvider] = useState<Eip1193Provider | undefined>(undefined);
  const providerRef = useRef<Eip1193Provider | undefined>(undefined);
  providerRef.current = provider;
  const statusRef = useRef(status);
  statusRef.current = status;

  const active = () => providerRef.current ?? injected();

  // Derive wallet state without prompting - eth_accounts only returns
  // accounts the site is already authorized for.
  const refresh = useCallback(async (): Promise<WalletStatus> => {
    const eth = active();
    if (!eth) {
      setStatus("noWallet");
      return "noWallet";
    }
    try {
      const [accounts, cid] = await Promise.all([
        eth.request({ method: "eth_accounts" }) as Promise<string[]>,
        eth.request({ method: "eth_chainId" }) as Promise<string>,
      ]);
      if (!accounts?.length) {
        setStatus("idle");
        setAddress("");
        setBalance(0n);
        return "idle";
      }
      if (Number(BigInt(cid)) !== chainId) {
        setStatus("wrongChain");
        setAddress(accounts[0]);
        return "wrongChain";
      }
      const bp = new BrowserProvider(eth as any);
      setAddress(accounts[0]);
      setBalance(await bp.getBalance(accounts[0]));
      setStatus("ready");
      // count this wallet once per browser - telemetry, best effort
      try {
        const flag = `bo:counted:${chainId}:${accounts[0].toLowerCase()}`;
        if (!localStorage.getItem(flag)) {
          localStorage.setItem(flag, "1");
          void fetch("/api/connects", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ address: accounts[0] }),
          })
            .then((r) => r.json())
            .then((j) => {
              if (typeof j?.count === "number") {
                window.dispatchEvent(
                  new CustomEvent<number>("bo:connects", { detail: j.count })
                );
              }
            })
            .catch(() => {});
        }
      } catch {}
      return "ready";
    } catch {
      // transient wallet/RPC hiccup - keep prior state
      return "idle";
    }
  }, [chainId]);

  const connect = useCallback(
    async (picked?: Eip1193Provider) => {
      // reentry guard - double-click / two rows at once must not stack prompts
      if (statusRef.current === "connecting") return;
      const eth = picked ?? injected();
      if (!eth) {
        setStatus("noWallet");
        const msg = "No EVM wallet found. Install MetaMask or another EVM wallet, then retry.";
        setConnectError(msg);
        toast.error(msg);
        return;
      }
      if (picked) {
        providerRef.current = picked;
        setProvider(picked);
        const w = getWallets().find((x) => x.provider === picked);
        try {
          if (w) localStorage.setItem(LS_KEY, w.info.uuid);
        } catch {}
      }
      setStatus("connecting");
      setConnectError("");
      // Some wallets silently queue a second eth_requestAccounts and never
      // settle - reset the UI after 60s. If the user approves late,
      // accountsChanged fires and refresh() picks it up anyway.
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const req = eth.request({ method: "eth_requestAccounts" });
        // If the 60s timeout wins the race, req still settles later - swallow
        // its outcome here so a late user-rejection isn't an unhandled
        // rejection. accountsChanged->refresh() picks up a late approval.
        req.catch(() => {});
        await Promise.race([
          req,
          new Promise((_, rej) => {
            timer = setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "PROMPT_TIMEOUT" })), 60_000);
          }),
        ]);
      } catch (e: any) {
        const msg =
          e?.code === 4001
            ? "Connection canceled in your wallet"
            : e?.code === -32002
              ? "A connection prompt is already open in your wallet"
              : e?.code === "PROMPT_TIMEOUT"
                ? "Wallet did not respond. Open it, then retry."
                : (e?.shortMessage ?? e?.message ?? "connection rejected");
        setConnectError(msg);
        if (e?.code === 4001) toast.warning(msg);
        else toast.error(msg);
        setStatus("idle");
        return;
      } finally {
        clearTimeout(timer);
      }
      const s = await refresh();
      if (s === "ready") toast.success("Wallet connected");
      else if (s === "wrongChain") toast.warning(`Connected; switch to ${chainName}`);
    },
    [refresh, chainName]
  );

  // EIP-1193 has no disconnect method - we forget the provider locally and
  // best-effort revoke the permission where supported (MetaMask) so the
  // next connect actually prompts again.
  const disconnect = useCallback(() => {
    const eth = providerRef.current;
    try {
      void eth
        ?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] })
        .catch(() => {});
    } catch {}
    providerRef.current = undefined;
    setProvider(undefined);
    try {
      localStorage.removeItem(LS_KEY);
    } catch {}
    setAddress("");
    setBalance(0n);
    setConnectError("");
    setStatus(injected() ? "idle" : "noWallet");
    toast.success("Wallet disconnected");
  }, []);

  const switchChain = useCallback(async () => {
    const eth = active();
    if (!eth) return;
    setConnectError("");
    const hexId = "0x" + chainId.toString(16);
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
    } catch (e: any) {
      if (e?.code === 4902) {
        try {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: hexId,
              chainName,
              rpcUrls: [rpc],
              nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
              blockExplorerUrls: [explorer],
            }],
          });
        } catch (e2: any) {
          setConnectError(e2?.message ?? "could not add network");
          toast.error(e2?.message ?? "could not add network");
          return;
        }
      } else {
        const msg = e?.shortMessage ?? e?.message ?? "network switch rejected";
        setConnectError(msg);
        toast.error(msg);
        return;
      }
    }
    const s = await refresh();
    if (s === "ready") toast.success(`Switched to ${chainName}`);
    else if (s === "wrongChain") toast.warning(`Still on the wrong network; expected chain ${chainId}`);
  }, [chainId, chainName, rpc, explorer, refresh]);

  // Restore the wallet the user picked last visit once EIP-6963
  // providers announce themselves. Discovery must start here - it otherwise
  // only runs when the modal renders, and an empty announce map makes the
  // saved-uuid lookup silently fall back to window.ethereum.
  useEffect(() => {
    getWallets(); // triggers startDiscovery() + the announce request
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LS_KEY);
    } catch {}
    if (!saved) return;
    const t = setTimeout(() => {
      const w = findWallet(saved);
      if (w) {
        providerRef.current = w.provider;
        setProvider(w.provider);
        refresh();
      }
    }, 150);
    return () => clearTimeout(t);
  }, [refresh]);

  useEffect(() => {
    refresh();
    const eth = active();
    const onChange = () => refresh();
    eth?.on?.("accountsChanged", onChange);
    eth?.on?.("chainChanged", onChange);
    eth?.on?.("disconnect", onChange);
    return () => {
      eth?.removeListener?.("accountsChanged", onChange);
      eth?.removeListener?.("chainChanged", onChange);
      eth?.removeListener?.("disconnect", onChange);
    };
  }, [refresh, provider]);

  const openWalletModal = useCallback(() => setModalOpen(true), []);
  const chain = useMemo(
    () => ({
      name: chainName,
      id: chainId,
      hexId: "0x" + chainId.toString(16),
      rpc,
      explorer,
      symbol: "BOT",
    }),
    [chainName, chainId, rpc, explorer]
  );
  // Memoize: a fresh object every render would re-render every consumer
  // (Playground, modal, connect button) on any provider state change.
  const ctx = useMemo<WalletCtxValue>(
    () => ({
      status, address, balance, connectError, chain, provider, connect, disconnect, switchChain, refresh, openWalletModal,
    }),
    [status, address, balance, connectError, chain, provider, connect, disconnect, switchChain, refresh, openWalletModal]
  );

  return (
    <WalletContext.Provider value={ctx}>
      {children}
      <WalletModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </WalletContext.Provider>
  );
}

export function ConnectWalletButton() {
  const { status, address, balance, switchChain, openWalletModal, disconnect } = useWallet();
  const btn =
    "rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary";

  if (status === "ready") {
    return (
      <button
        onClick={disconnect}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-mono text-foreground hover:border-secondary focus-visible:outline-2 focus-visible:outline-primary"
        title={`${address} · ${Number(formatEther(balance)).toFixed(4)} BOT · click to disconnect`}
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
        {short(address)}
      </button>
    );
  }
  if (status === "wrongChain") {
    return (
      <button onClick={switchChain} className={`${btn} bg-warning text-black hover:bg-warning/80`}>
        Wrong network · switch
      </button>
    );
  }
  return (
    <button
      onClick={openWalletModal}
      disabled={status === "connecting"}
      className={`${btn} bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50`}
    >
      {status === "connecting" ? "Connecting…" : "Connect wallet →"}
    </button>
  );
}
