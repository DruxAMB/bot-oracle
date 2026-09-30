"use client";

import { useEffect, useRef, useState } from "react";
import {
  BrowserProvider,
  JsonRpcProvider,
  Contract,
  AbiCoder,
  formatEther,
} from "ethers";
import { useWallet } from "./Wallet";
import Dialog, { DialogHeader } from "./Dialog";
import Markdown from "./Markdown";
import { ThinkingOrb } from "thinking-orbs";
import { toast } from "sonner";

const COORD_ABI = [
  "function request(bytes32,bytes,address,uint64) payable returns (uint256)",
  "function requests(uint256) view returns (address requester, bytes32 modelId, bytes32 inputHash, uint256 fee, address callbackContract, uint64 callbackGasLimit, uint64 createdAt, uint64 fulfilledAt, uint8 status, bytes32 outputHash, address operator, address challenger)",
  "event RequestSent(uint256 indexed requestId, address indexed requester, bytes32 indexed modelId, bytes32 inputHash, bytes input, address callbackContract)",
  "event RequestFulfilled(uint256 indexed requestId, address indexed operator, bytes32 outputHash, bytes output)",
];
const abi = AbiCoder.defaultAbiCoder();
const short = (a: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

type ModelOpt = { modelId: string; label: string; backend: string; priceWei: string; active: boolean };
type Phase =
  | { s: "idle" }
  | { s: "signing" }
  | { s: "pending"; requestId: string; txHash: string }
  | { s: "done"; requestId: string; txHash: string; fulfillTx?: string; result: string }
  | { s: "error"; message: string };

const modelHint = (backend: string) =>
  backend.startsWith("echo:")
    ? "Returns your prompt back; cheapest sanity check."
    : backend.startsWith("sentinel:")
      ? "Ignores your prompt; writes a live BOT Chain market report via the LLM."
      : backend.startsWith("openai:") || backend.startsWith("llm:")
        ? "General LLM call; requires the operator to have that model's API key configured."
        : "";

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
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ s: "idle" });
  const [modelIdx, setModelIdx] = useState(0);
  const [prompt, setPrompt] = useState("");
  const pollGen = useRef(0);

  const model = models[modelIdx];
  const busy = phase.s === "signing" || phase.s === "pending";
  const insufficient =
    wallet.status === "ready" && !!model && wallet.balance < BigInt(model.priceWei);

  async function pollResult(requestId: string, txHash: string, fromBlock: number) {
    // Generation guard: a superseded poll (stale resume, or a newer send)
    // must not write phase or touch pg-pending.
    const gen = ++pollGen.current;
    const reader = new JsonRpcProvider(rpc, chainId, { staticNetwork: true });
    const ro = new Contract(coordinator, COORD_ABI, reader);
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      if (gen !== pollGen.current) return;
      try {
        const r = await ro.requests(requestId);
        const status = Number(r.status);
        if (status === 1 || status === 4) {
          const logs = await reader.getLogs({
            address: coordinator,
            topics: [
              ro.interface.getEvent("RequestFulfilled")!.topicHash,
              "0x" + BigInt(requestId).toString(16).padStart(64, "0"),
            ],
            fromBlock: Math.max(0, fromBlock - 5),
            toBlock: "latest",
          });
          let result = "(fulfilled; output not decodable)";
          let fulfillTx: string | undefined;
          if (logs[0]) {
            fulfillTx = logs[0].transactionHash;
            try {
              const [, output] = abi.decode(["bytes32", "bytes"], logs[0].data);
              [result] = abi.decode(["string"], output);
            } catch {}
          }
          if (gen !== pollGen.current) return;
          localStorage.removeItem("pg-pending");
          setPhase({ s: "done", requestId, txHash, fulfillTx, result });
          toast.success(`Request #${requestId} fulfilled`, {
            action: fulfillTx
              ? { label: "fulfill tx ↗", onClick: () => window.open(`${explorer}/tx/${fulfillTx}`, "_blank") }
              : undefined,
          });
          wallet.refresh();
          return;
        }
        if (status === 2 || status === 3) {
          if (gen !== pollGen.current) return;
          localStorage.removeItem("pg-pending");
          throw new Error(`request ended: status ${status}`);
        }
      } catch (e: any) {
        if (e?.message?.startsWith("request ended")) throw e;
        // transient RPC hiccup - keep polling
      }
    }
    if (gen !== pollGen.current) return;
    localStorage.removeItem("pg-pending");
    const msg = `Request #${requestId} still pending after 180s; check the explorer.`;
    setPhase({ s: "error", message: msg });
    toast.error(msg);
  }

  // Restore draft + resume an in-flight request across page refreshes.
  useEffect(() => {
    const draft = sessionStorage.getItem("pg-prompt");
    if (draft) setPrompt(draft);
    const pending = localStorage.getItem("pg-pending");
    if (pending) {
      try {
        const { requestId, txHash, block } = JSON.parse(pending);
        setPhase({ s: "pending", requestId, txHash });
        setOpen(true);
        pollResult(requestId, txHash, block ?? 0).catch((e) => {
          const msg = e?.message ?? "poll failed";
          setPhase({ s: "error", message: msg });
          toast.error(msg);
        });
      } catch {
        localStorage.removeItem("pg-pending");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    if (!model || !prompt.trim()) return;
    setPhase({ s: "signing" });
    try {
      const bp = new BrowserProvider((window as any).ethereum);
      // Re-check chain at send time - the user may have switched networks
      // after connecting; broadcasting there would pay on the wrong chain.
      const net = await bp.getNetwork();
      if (Number(net.chainId) !== chainId) {
        wallet.refresh();
        throw new Error("wallet is on the wrong network; switch back and retry");
      }
      const signer = await bp.getSigner();
      const coord = new Contract(coordinator, COORD_ABI, signer);
      const input = abi.encode(["string"], [prompt.trim()]);
      const tx = await coord.request(
        model.modelId,
        input,
        "0x0000000000000000000000000000000000000000",
        0,
        { value: BigInt(model.priceWei) }
      );
      const receipt = await tx.wait();
      if (!receipt || receipt.status === 0) {
        throw new Error("transaction reverted; check the tx on the explorer for the reason");
      }
      const reqLog = receipt.logs
        .map((l: any) => {
          try {
            return coord.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((x: any) => x?.name === "RequestSent");
      const requestId = reqLog?.args?.requestId?.toString();
      if (!requestId) throw new Error("requestId missing from receipt");
      setPhase({ s: "pending", requestId, txHash: tx.hash });
      toast.success(`Request #${requestId} submitted; operator notified`, {
        action: { label: "tx ↗", onClick: () => window.open(`${explorer}/tx/${tx.hash}`, "_blank") },
      });
      localStorage.setItem(
        "pg-pending",
        JSON.stringify({ requestId, txHash: tx.hash, block: receipt.blockNumber })
      );
      await pollResult(requestId, tx.hash, receipt.blockNumber);
    } catch (e: any) {
      if (e?.message?.startsWith("request ended")) pollGen.current++;
      localStorage.removeItem("pg-pending");
      wallet.refresh();
      const msg = e?.shortMessage ?? e?.info?.error?.message ?? e?.message ?? "request failed";
      setPhase({ s: "error", message: msg });
      toast.error(msg);
    }
  }

  return (
    <section
      aria-labelledby="play-h"
      className="rounded-lg border border-border bg-card p-5 mb-8 flex flex-wrap items-center justify-between gap-3"
    >
      <h2 id="play-h" className="text-sm font-medium text-foreground">
        Playground
      </h2>
      <div className="flex items-center gap-3">
        {phase.s === "pending" && (
          <span role="status" className="text-xs text-warning">
            request #{phase.requestId} in flight…
          </span>
        )}
        <a
          href="#integrate-h"
          className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-secondary focus-visible:outline-2 focus-visible:outline-primary"
        >
          integrate the SDK ↓
        </a>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-primary"
        >
          Try the oracle →
        </button>
      </div>

      {open && (
        <Dialog onClose={() => setOpen(false)} labelId="try-h">
          <DialogHeader id="try-h" title="Try the oracle" onClose={() => setOpen(false)} />
          <p className="text-xs text-muted-foreground mb-4">
              A real on-chain request signed by your wallet; you pay tBOT, the operator runs the
              model, the answer is written back on-chain. Every query costs tBOT, including spam.
            </p>

            {wallet.status === "noWallet" && (
              <p className="text-sm text-warning">
                No EVM wallet found -{" "}
                <a className="underline" href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer">
                  install MetaMask
                </a>{" "}
                or BO Wallet, then retry.
              </p>
            )}

            {(wallet.status === "idle" || wallet.status === "connecting") && (
              <button
                onClick={wallet.connect}
                disabled={wallet.status === "connecting"}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
              >
                {wallet.status === "connecting" ? "Connecting…" : "Connect wallet →"}
              </button>
            )}

            {wallet.status === "wrongChain" && (
              <div className="text-sm">
                <p className="text-warning mb-2">Wallet is on the wrong network.</p>
                <button
                  onClick={wallet.switchChain}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                >
                  Switch to chain {chainId}
                </button>
              </div>
            )}

            {wallet.connectError && wallet.status !== "ready" && (
              <p className="mt-2 text-xs text-danger">{wallet.connectError}</p>
            )}

            {wallet.status === "ready" && (
              <form onSubmit={(e) => { e.preventDefault(); if (!busy) send(); }} className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label htmlFor="pg-model" className="text-xs text-muted-foreground">
                    Model
                  </label>
                  <select
                    id="pg-model"
                    value={modelIdx}
                    onChange={(e) => setModelIdx(Number(e.target.value))}
                    disabled={busy}
                    className="rounded bg-background border border-border px-2 py-1.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {models.map((m, i) => (
                      <option key={m.modelId} value={i}>
                        {m.label} · {formatEther(BigInt(m.priceWei))} BOT
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-steel font-mono">
                    {short(wallet.address)} · {Number(formatEther(wallet.balance)).toFixed(3)} BOT
                  </span>
                </div>
                {model && modelHint(model.backend) && (
                  <p className="text-xs text-steel">{modelHint(model.backend)}</p>
                )}

                <div>
                  <label htmlFor="pg-prompt" className="sr-only">
                    Prompt
                  </label>
                  <textarea
                    id="pg-prompt"
                    value={prompt}
                    onChange={(e) => {
                      setPrompt(e.target.value);
                      sessionStorage.setItem("pg-prompt", e.target.value);
                    }}
                    disabled={busy}
                    rows={3}
                    maxLength={500}
                    placeholder="Ask the oracle anything…"
                    className="w-full rounded bg-background border border-border px-3 py-2 text-base text-foreground placeholder-steel focus-visible:outline-2 focus-visible:outline-primary"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={busy || !prompt.trim() || !model || insufficient}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {phase.s === "signing"
                      ? "Confirm in wallet…"
                      : phase.s === "pending"
                        ? "Waiting for fulfill…"
                        : `Send query · ${model ? formatEther(BigInt(model.priceWei)) : "?"} BOT →`}
                  </button>
                  {insufficient && (
                    <span className="text-xs text-warning">
                      Balance too low; get tBOT at{" "}
                      <a
                        className="underline"
                        href="https://faucet.botchain.ai/en/basic"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        the faucet
                      </a>
                    </span>
                  )}
                </div>
              </form>
            )}

            <div aria-live="polite" className="mt-3 text-sm">
              {phase.s === "pending" && (
                <p className="flex items-center gap-2.5 text-warning">
                  <ThinkingOrb state="working" size={20} theme="dark" />
                  <span>
                    Request #{phase.requestId} submitted ·{" "}
                    <a className="underline" href={`${explorer}/tx/${phase.txHash}`} target="_blank" rel="noopener noreferrer">
                      tx ↗
                    </a>{" "}
                    · operator is running inference…
                  </span>
                </p>
              )}
              {phase.s === "done" && (
                <div>
                  <p className="text-foreground mb-1">
                    Request #{phase.requestId} fulfilled ·{" "}
                    <a className="underline" href={`${explorer}/tx/${phase.txHash}`} target="_blank" rel="noopener noreferrer">
                      request ↗
                    </a>
                    {phase.fulfillTx && (
                      <>
                        {" · "}
                        <a className="underline" href={`${explorer}/tx/${phase.fulfillTx}`} target="_blank" rel="noopener noreferrer">
                          fulfill ↗
                        </a>
                      </>
                    )}
                  </p>
                  <div className="rounded bg-background border border-border p-3">
                    <Markdown>{phase.result}</Markdown>
                  </div>
                </div>
              )}
              {phase.s === "error" && <p className="text-danger">{phase.message}</p>}
            </div>
        </Dialog>
      )}
    </section>
  );
}
