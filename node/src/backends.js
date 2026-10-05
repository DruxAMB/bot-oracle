// Model backends. v1 is passthrough-first per spec: hosted LLM APIs behind a
// small interface. "echo" exists so the full pipeline is testable with no keys.
// "sentinel:" is the flagship intel backend - it reads live chain state, builds
// a data-bearing prompt, and calls the configured LLM. With no key configured
// it emits a deterministic data report (labeled) instead of faking inference.

import { getBytes, Contract, formatEther, formatUnits } from "ethers";

const DECODER = new TextDecoder();

function parsePrompt(rawInput) {
  // abi.decode hands us a hex string - normalize to bytes before anything else.
  const inputBytes = typeof rawInput === "string" ? getBytes(rawInput) : rawInput;
  // Consumers send ABI-encoded payloads; try abi.decode(string) first, then
  // raw utf8, else hex. Model-defined per spec - keep permissive here.
  try {
    // abi.encode(string): 32B offset (must be 32) + 32B byte-length + utf8 data.
    // Compare byte lengths - char count diverges for non-ASCII.
    if (inputBytes.length >= 64) {
      const offset = Number(BigInt("0x" + Buffer.from(inputBytes.slice(0, 32)).toString("hex")));
      const len = Number(BigInt("0x" + Buffer.from(inputBytes.slice(32, 64)).toString("hex")));
      if (offset === 32 && len > 0 && inputBytes.length >= 64 + len) {
        return DECODER.decode(inputBytes.slice(64, 64 + len));
      }
    }
  } catch {}
  try { return DECODER.decode(inputBytes); } catch {}
  return "0x" + Buffer.from(inputBytes).toString("hex");
}

async function echo(prompt) {
  return `echo:${prompt}`;
}

// --- sentinel: live on-chain data → LLM brief -------------------------------
// Env-configured data sources; defaults are the public testnet deployment.
const BDEX = {
  factory: process.env.BDEX_FACTORY ?? "0x65b8e98ceA190d8c28B3e4716402027f634d15a3",
  wbot: process.env.BDEX_WBOT ?? "0xD5452816194a3784dBa983426cCe7c122F4abd30",
  usdt: process.env.BDEX_USDT ?? "0x75edC9335175Fc0552D51D48439F229c10420fe3",
};
const FACTORY_ABI = ["function getPair(address,address) view returns (address)"];
const PAIR_ABI = ["function getReserves() view returns (uint112,uint112,uint32)", "function token0() view returns (address)"];
const ERC20_ABI = ["function decimals() view returns (uint8)", "function symbol() view returns (string)"];

async function chainSnapshot(cfg) {
  const p = cfg.provider;
  const coord = new Contract(cfg.coordinator, [
    "function nextRequestId() view returns (uint256)",
    "function accruedProtocolFees() view returns (uint256)",
  ], p);
  const snap = { ok: {} };
  const [block, gasPrice, nextId, fees] = await Promise.all([
    p.getBlockNumber(), p.getFeeData().then(f => f.gasPrice),
    coord.nextRequestId(), coord.accruedProtocolFees(),
  ]);
  snap.block = Number(block);
  snap.gasGwei = formatUnits(gasPrice ?? 0n, "gwei");
  snap.requests = Number(nextId - 1n);
  snap.feesBot = formatEther(fees);

  // BDEX reserves - best-effort; pair may not exist yet on a fresh deployment
  try {
    if ((await p.getCode(BDEX.factory)) === "0x") {
      throw new Error(`no contract at factory ${BDEX.factory} on chain ${cfg.chainId}`);
    }
    const factory = new Contract(BDEX.factory, FACTORY_ABI, p);
    const pairAddr = await factory.getPair(BDEX.wbot, BDEX.usdt);
    if (pairAddr !== "0x0000000000000000000000000000000000000000") {
      const pair = new Contract(pairAddr, PAIR_ABI, p);
      const wbotT = new Contract(BDEX.wbot, ERC20_ABI, p);
      const usdtT = new Contract(BDEX.usdt, ERC20_ABI, p);
      const [[r0, r1], t0, wbotDec, usdtDec] = await Promise.all([
        pair.getReserves(), pair.token0(), wbotT.decimals(), usdtT.decimals(),
      ]);
      const [wbotR, usdtR] = t0.toLowerCase() === BDEX.wbot.toLowerCase() ? [r0, r1] : [r1, r0];
      const wbot = Number(formatUnits(wbotR, wbotDec));
      const usdt = Number(formatUnits(usdtR, usdtDec));
      snap.pair = { wbot, usdt, price: wbot > 0 ? usdt / wbot : 0 };
    }
  } catch (e) {
    snap.pairError = e.message?.slice(0, 120);
  }
  return snap;
}

function deterministicReport(prompt, s) {
  const liq = s.pair
    ? `WBOT/USDT pool holds ${s.pair.usdt.toFixed(2)} USDT vs ${s.pair.wbot.toFixed(1)} WBOT (implied ~$${s.pair.price.toFixed(2)}).`
    : `BDEX WBOT/USDT pair unreadable (${s.pairError ?? "no pair"}).`;
  return [
    `[sentinel:data - deterministic, no LLM key configured]`,
    ``,
    `Block ${s.block}. Gas ${Number(s.gasGwei).toFixed(1)} gwei. ${liq}`,
    `Oracle: ${s.requests} requests served, ${Number(s.feesBot).toFixed(4)} BOT accrued in protocol fees.`,
    `Prompt on record: ${prompt.slice(0, 140)}`,
  ].join("\n");
}

async function sentinel(prompt, cfg) {
  const s = await chainSnapshot(cfg);
  const dataBrief = [
    `BOT Chain chainId ${cfg.chainId} snapshot @ block ${s.block}:`,
    s.pair
      ? `- BDEX WBOT/USDT: ${s.pair.usdt.toFixed(2)} USDT / ${s.pair.wbot.toFixed(1)} WBOT, implied price $${s.pair.price.toFixed(2)}`
      : `- BDEX WBOT/USDT pair: unavailable (${s.pairError ?? "none"})`,
    `- gas price: ${Number(s.gasGwei).toFixed(1)} gwei`,
    `- bot-oracle: ${s.requests} requests served, ${s.feesBot} BOT accrued fees`,
  ].join("\n");

  if (!cfg.llm?.apiKey) return deterministicReport(prompt, s);

  const llmPrompt =
    "You are Sentinel, an autonomous market-intelligence agent on BOT Chain. " +
    "Write a concise intel brief (max 160 words) in GitHub-flavored markdown: " +
    "use ### headings (Liquidity, Activity, Anomalies), **bold** key figures, " +
    "and short bullet points. No preamble.\n\nLIVE ON-CHAIN DATA:\n" + dataBrief +
    "\n\nANALYST REQUEST:\n" + prompt;
  try {
    const text = await openaiCompat(llmPrompt, {
      apiKey: cfg.llm.apiKey,
      baseUrl: cfg.llm.baseUrl ?? "https://api.openai.com/v1",
      model: cfg.llm.model || "gpt-4o-mini",
    });
    // own line for the audit label - a mid-paragraph prefix breaks `###` heading parse
    return `[sentinel:${cfg.llm.model || "gpt-4o-mini"}]\n\n${text.trim()}`;
  } catch (e) {
    // LLM down/quota exhausted - degrade to the deterministic report rather
    // than leaving the request pending until timeout. Label stays honest.
    return `${deterministicReport(prompt, s)} [llm error: ${e.message?.slice(0, 100)}]`;
  }
}

async function openaiCompat(prompt, cfg) {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`LLM backend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? "";
}

// backend string from ModelRegistry, e.g. "echo:local", "openai:gpt-4o-mini"
export async function runInference(backend, inputBytes, cfg) {
  const prompt = parsePrompt(inputBytes);
  const [kind] = backend.split(":");
  switch (kind) {
    case "echo":
      return echo(prompt);
    case "sentinel":
      return sentinel(prompt, cfg);
    case "openai":
      if (!cfg.llm?.apiKey) throw new Error("LLM_API_KEY not configured");
      return openaiCompat(prompt, {
        apiKey: cfg.llm.apiKey,
        baseUrl: cfg.llm.baseUrl ?? "https://api.openai.com/v1",
        model: backend.slice("openai:".length) || cfg.llm.model || "gpt-4o-mini",
      });
    default:
      throw new Error(`unknown backend kind: ${kind}`);
  }
}
