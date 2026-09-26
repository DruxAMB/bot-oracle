// Model backends. v1 is passthrough-first per spec: hosted LLM APIs behind a
// small interface. "echo" exists so the full pipeline is testable with no keys.

import { getBytes } from "ethers";

const DECODER = new TextDecoder();

function parsePrompt(rawInput) {
  // abi.decode hands us a hex string — normalize to bytes before anything else.
  const inputBytes = typeof rawInput === "string" ? getBytes(rawInput) : rawInput;
  // Consumers send ABI-encoded payloads; try abi.decode(string) first, then
  // raw utf8, else hex. Model-defined per spec — keep permissive here.
  try {
    // abi-encoded single string: 32B offset + 32B len + data
    if (inputBytes.length > 64) {
      const len = Number(BigInt("0x" + Buffer.from(inputBytes.slice(32, 64)).toString("hex")));
      const text = DECODER.decode(inputBytes.slice(64, 64 + len));
      if (text.length === len && len > 0) return text;
    }
  } catch {}
  try { return DECODER.decode(inputBytes); } catch {}
  return "0x" + Buffer.from(inputBytes).toString("hex");
}

async function echo(prompt) {
  return `echo:${prompt}`;
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
    case "openai":
      if (!cfg.openai?.apiKey) throw new Error("OPENAI_API_KEY not configured");
      return openaiCompat(prompt, {
        apiKey: cfg.openai.apiKey,
        baseUrl: cfg.openai.baseUrl ?? "https://api.openai.com/v1",
        model: backend.slice("openai:".length) || cfg.openai.model || "gpt-4o-mini",
      });
    default:
      throw new Error(`unknown backend kind: ${kind}`);
  }
}
