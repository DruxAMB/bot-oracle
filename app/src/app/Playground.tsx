"use client";

import { useState } from "react";
import {
  BrowserProvider,
  JsonRpcProvider,
  Contract,
  AbiCoder,
  formatEther,
  getAddress,
} from "ethers";

const COORD_ABI = [
  "function request(bytes32,bytes,address,uint64) payable returns (uint256)",
  "function requests(uint256) view returns (address,bytes32,bytes32,uint256,address,uint64,uint64,uint64,uint8,bytes32,address,address)",
  "event RequestFulfilled(uint256 indexed requestId, address indexed operator, bytes32 outputHash, bytes output)",
];
const abi = AbiCoder.defaultAbiCoder();
const short = (a: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

type ModelOpt = { modelId: string; label: string; backend: string; priceWei: string; active: boolean };
type Phase =
  | { s: "idle" }
  | { s: "connecting" }
  | { s: "wrongChain" }
  | { s: "ready"; address: string; balance: bigint }
  | { s: "signing" }
  | { s: "pending"; requestId: string; txHash: string }
  | { s: "done"; requestId: string; txHash: string; fulfillTx?: string; result: string }
  | { s: "error"; message: string; retry?: () => void };

export default function Playground({
  coordinator,
  models,
  chainId,
  rpc,
  explorer,
}: {
  coordinator: string;
  models: ModelOpt[];
  chainId: number;
  rpc: string;
  explorer: string;
}) {
  const [phase, setPhase] = useState<Phase>({ s: "idle" });
  const [modelIdx, setModelIdx] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [signerAddr, setSignerAddr] = useState("");

  const model = models[modelIdx];

  async function connect() {
    setPhase({ s: "connecting" });
    try {
      const eth = (window as any).ethereum;
      if (!eth) {
        setPhase({
          s: "error",
          message: "No EVM wallet found — install MetaMask or BO Wallet, then retry.",
        });
        return;
      }
      const bp = new BrowserProvider(eth);
      const net = await bp.getNetwork();
      if (Number(net.chainId) !== chainId) {
        setPhase({ s: "wrongChain" });
        return;
      }
      const signer = await bp.getSigner();
      const address = await signer.getAddress();
      const balance = await bp.getBalance(address);
      setSignerAddr(address);
      setPhase({ s: "ready", address, balance });
    } catch (e: any) {
      setPhase({ s: "error", message: e?.shortMessage ?? e?.message ?? "wallet connection failed" });
    }
  }

  async function switchChain() {
    try {
      const eth = (window as any).ethereum;
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x" + chainId.toString(16) }],
      });
      await connect();
    } catch (e: any) {
      if (e?.code === 4902) {
        try {
          await (window as any).ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x" + chainId.toString(16),
              chainName: "BOT Chain Testnet",
              rpcUrls: [rpc],
              nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
              blockExplorerUrls: [explorer],
            }],
          });
          await connect();
        } catch (e2: any) {
          setPhase({ s: "error", message: e2?.message ?? "could not add network" });
        }
      } else {
        setPhase({ s: "error", message: e?.shortMessage ?? e?.message ?? "chain switch rejected" });
      }
    }
  }

  async function send() {
    if (!model || !prompt.trim()) return;
    const eth = (window as any).ethereum;
    setPhase({ s: "signing" });
    try {
      const bp = new BrowserProvider(eth);
      const signer = await bp.getSigner();
      const coord = new Contract(coordinator, COORD_ABI, signer);
      const input = abi.encode(["string"], [prompt.trim()]);
      const tx = await coord.request(model.modelId, input, "0x0000000000000000000000000000000000000000", 0, {
        value: BigInt(model.priceWei),
      });
      const receipt = await tx.wait();
      const reqLog = receipt.logs
        .map((l: any) => { try { return coord.interface.parseLog(l); } catch { return null; } })
        .find((x: any) => x?.name === "RequestSent");
      const requestId = reqLog?.args?.requestId?.toString();
      if (!requestId) throw new Error("requestId missing from receipt");
      setPhase({ s: "pending", requestId, txHash: tx.hash });

      // poll for fulfillment
      const reader = new JsonRpcProvider(rpc, chainId);
      const ro = new Contract(coordinator, COORD_ABI, reader);
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const r = await ro.requests(requestId);
        const status = Number(r.status);
        if (status === 1 || status === 4) {
          const logs = await reader.getLogs({
            address: coordinator,
            topics: [ro.interface.getEvent("RequestFulfilled")!.topicHash, "0x" + BigInt(requestId).toString(16).padStart(64, "0")],
            fromBlock: Math.max(0, receipt.blockNumber - 5),
            toBlock: "latest",
          });
          let result = "(fulfilled — output not decodable)";
          let fulfillTx: string | undefined;
          if (logs[0]) {
            fulfillTx = logs[0].transactionHash;
            try {
              const [, output] = abi.decode(["bytes32", "bytes"], logs[0].data);
              [result] = abi.decode(["string"], output);
            } catch {}
          }
          setPhase({ s: "done", requestId, txHash: tx.hash, fulfillTx, result });
          return;
        }
        if (status === 2 || status === 3) throw new Error(`request ended: status ${status}`);
      }
      setPhase({ s: "error", message: `Request #${requestId} still pending after 120s — check the explorer.` });
    } catch (e: any) {
      setPhase({ s: "error", message: e?.shortMessage ?? e?.info?.error?.message ?? e?.message ?? "request failed" });
    }
  }

  const busy = phase.s === "connecting" || phase.s === "signing" || phase.s === "pending";
  const insufficient = phase.s === "ready" && !!model && phase.balance < BigInt(model.priceWei);

  return (
    <section aria-labelledby="play-h" className="rounded-lg border border-sky-900/60 bg-sky-950/20 p-5 mb-8">
      <h2 id="play-h" className="text-sm font-medium text-sky-300 mb-1">Try the oracle — you pay, it answers</h2>
      <p className="text-xs text-zinc-500 mb-4">
        A real on-chain request signed by your wallet. Every query costs tBOT — including spam.
      </p>

      {phase.s === "idle" && (
        <button
          onClick={connect}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          Connect wallet
        </button>
      )}

      {phase.s === "wrongChain" && (
        <div className="text-sm">
          <p className="text-amber-300 mb-2">Wallet is on the wrong network.</p>
          <button onClick={switchChain} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500">
            Switch to BOT Chain Testnet (chain {chainId})
          </button>
        </div>
      )}

      {(phase.s === "ready" || busy || phase.s === "done" || phase.s === "error") && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (!busy) send(); }}
          className="space-y-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="pg-model" className="text-xs text-zinc-500">Model</label>
            <select
              id="pg-model"
              value={modelIdx}
              onChange={(e) => setModelIdx(Number(e.target.value))}
              disabled={busy}
              className="rounded bg-zinc-950 border border-zinc-800 px-2 py-1.5 text-sm text-zinc-200 focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              {models.map((m, i) => (
                <option key={m.modelId} value={i}>
                  {m.label} — {formatEther(BigInt(m.priceWei))} BOT
                </option>
              ))}
            </select>
            {signerAddr && (
              <span className="text-xs text-zinc-600 font-mono">{short(signerAddr)}</span>
            )}
          </div>

          <div>
            <label htmlFor="pg-prompt" className="sr-only">Prompt</label>
            <textarea
              id="pg-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={busy}
              rows={2}
              maxLength={500}
              placeholder="Ask the oracle anything…"
              className="w-full rounded bg-zinc-950 border border-zinc-800 px-3 py-2 text-base text-zinc-200 placeholder-zinc-600 focus-visible:outline-2 focus-visible:outline-sky-400"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy || !prompt.trim() || !model || insufficient}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              {phase.s === "signing" ? "Confirm in wallet…" :
               phase.s === "pending" ? "Waiting for fulfill…" :
               `Send query — ${model ? formatEther(BigInt(model.priceWei)) : "?"} BOT`}
            </button>
            {insufficient && (
              <span className="text-xs text-amber-400">
                Balance too low — get tBOT at{" "}
                <a className="underline" href="https://faucet.botchain.ai/en/basic" target="_blank" rel="noopener noreferrer">the faucet</a>
              </span>
            )}
          </div>
        </form>
      )}

      <div aria-live="polite" className="mt-3 text-sm">
        {phase.s === "pending" && (
          <p className="text-amber-300">
            Request #{phase.requestId} submitted ·{" "}
            <a className="underline" href={`${explorer}/tx/${phase.txHash}`} target="_blank" rel="noopener noreferrer">tx ↗</a>{" "}
            — waiting for the operator…
          </p>
        )}
        {phase.s === "done" && (
          <div>
            <p className="text-emerald-300 mb-1">
              Request #{phase.requestId} fulfilled ·{" "}
              <a className="underline" href={`${explorer}/tx/${phase.txHash}`} target="_blank" rel="noopener noreferrer">request ↗</a>
              {phase.fulfillTx && <>{" · "}<a className="underline" href={`${explorer}/tx/${phase.fulfillTx}`} target="_blank" rel="noopener noreferrer">fulfill ↗</a></>}
            </p>
            <p className="whitespace-pre-wrap rounded bg-zinc-950 border border-zinc-800/70 p-3 text-zinc-200">{phase.result}</p>
          </div>
        )}
        {phase.s === "error" && (
          <p className="text-red-400">{phase.message}</p>
        )}
      </div>
    </section>
  );
}
