"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { BrowserProvider, formatEther } from "ethers";
import { toast } from "sonner";

export type WalletStatus = "idle" | "connecting" | "noWallet" | "wrongChain" | "ready";

interface WalletCtxValue {
  status: WalletStatus;
  address: string;
  balance: bigint;
  connectError: string;
  connect(): Promise<void>;
  switchChain(): Promise<void>;
  refresh(): Promise<WalletStatus>;
}

const WalletContext = createContext<WalletCtxValue>({
  status: "idle",
  address: "",
  balance: 0n,
  connectError: "",
  connect: async () => {},
  switchChain: async () => {},
  refresh: async () => "idle" as WalletStatus,
});

export const useWallet = () => useContext(WalletContext);

const injected = () => (typeof window !== "undefined" ? (window as any).ethereum : undefined);
const short = (a: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

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

  // Derive wallet state without prompting - eth_accounts only returns
  // accounts the site is already authorized for.
  const refresh = useCallback(async (): Promise<WalletStatus> => {
    const eth = injected();
    if (!eth) {
      setStatus("noWallet");
      return "noWallet";
    }
    try {
      const [accounts, cid] = await Promise.all([
        eth.request({ method: "eth_accounts" }),
        eth.request({ method: "eth_chainId" }),
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
      const bp = new BrowserProvider(eth);
      setAddress(accounts[0]);
      setBalance(await bp.getBalance(accounts[0]));
      setStatus("ready");
      return "ready";
    } catch {
      // transient wallet/RPC hiccup - keep prior state
      return "idle";
    }
  }, [chainId]);

  const connect = useCallback(async () => {
    const eth = injected();
    if (!eth) {
      setStatus("noWallet");
      const msg = "No EVM wallet found. Install MetaMask or BO Wallet, then retry.";
      setConnectError(msg);
      toast.error(msg);
      return;
    }
    setStatus("connecting");
    setConnectError("");
    try {
      await eth.request({ method: "eth_requestAccounts" });
    } catch (e: any) {
      const msg = e?.shortMessage ?? e?.message ?? "connection rejected";
      setConnectError(msg);
      toast.error(msg);
      return;
    }
    const s = await refresh();
    if (s === "ready") toast.success("Wallet connected");
    else if (s === "wrongChain") toast.warning("Connected; switch to BOT Chain Testnet");
  }, [refresh]);

  const switchChain = useCallback(async () => {
    const eth = injected();
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

  useEffect(() => {
    refresh();
    const eth = injected();
    const onChange = () => refresh();
    eth?.on?.("accountsChanged", onChange);
    eth?.on?.("chainChanged", onChange);
    return () => {
      eth?.removeListener?.("accountsChanged", onChange);
      eth?.removeListener?.("chainChanged", onChange);
    };
  }, [refresh]);

  return (
    <WalletContext.Provider value={{ status, address, balance, connectError, connect, switchChain, refresh }}>
      {children}
    </WalletContext.Provider>
  );
}

export function ConnectWalletButton() {
  const { status, address, balance, connect, switchChain } = useWallet();
  const btn =
    "rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary";

  if (status === "ready") {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-mono text-foreground"
        title={`${address} · ${Number(formatEther(balance)).toFixed(4)} BOT`}
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
        {short(address)}
      </span>
    );
  }
  if (status === "noWallet") {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noopener noreferrer"
        className={`${btn} border border-border-strong text-secondary hover:text-foreground`}
      >
        Install wallet ↗
      </a>
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
      onClick={connect}
      disabled={status === "connecting"}
      className={`${btn} bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50`}
    >
      {status === "connecting" ? "Connecting…" : "Connect wallet →"}
    </button>
  );
}
