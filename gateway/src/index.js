// bot-oracle gateway - HTTP API over the on-chain oracle.
// POST /v1/query {model, prompt} -> on-chain request -> result + tx hashes.
// Every query is a real on-chain tx - "anchored on-chain" is the product claim,
// not a marketing line. API keys are issued after USDT payment (admin-settled
// for v1); quotas are enforced and metered per key.
import { createServer } from "node:http";
import { JsonRpcProvider, Wallet, Contract, AbiCoder, keccak256, toUtf8Bytes, getAddress } from "ethers";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const cfg = {
  port: Number(process.env.PORT ?? "8791"),
  rpc: process.env.RPC_URL ?? "https://rpc.bohr.life",
  chainId: Number(process.env.CHAIN_ID ?? "968"),
  coordinator: getAddress(process.env.COORDINATOR_ADDRESS ?? "0x0000000000000000000000000000000000000000"),
  models: getAddress(process.env.MODELS_ADDRESS ?? "0x0000000000000000000000000000000000000000"),
  walletKey: process.env.GATEWAY_KEY, // funds the escrowed query fees (BOT)
  stateFile: process.env.STATE_FILE ?? "./state/usage.json",
  syncTimeoutMs: Number(process.env.SYNC_TIMEOUT_MS ?? "90000"),
};
if (!cfg.walletKey) throw new Error("GATEWAY_KEY env required (BOT-funded wallet)");

// API keys with quotas: GATEWAY_KEYS="keyA:100,keyB:10" - issue after payment.
const quotas = new Map(
  (process.env.GATEWAY_KEYS ?? "").split(",").filter(Boolean).map((kv) => {
    const [k, q] = kv.split(":");
    return [k.trim(), Number(q)];
  })
);

const provider = new JsonRpcProvider(cfg.rpc, cfg.chainId);
const wallet = new Wallet(cfg.walletKey, provider);
const COORD_ABI = [
  "function request(bytes32,bytes,address,uint64) payable returns (uint256)",
  "function requestTimeout() view returns (uint64)",
  "function refundIfTimedOut(uint256)",
  "function requests(uint256) view returns (address,bytes32,bytes32,uint256,address,uint64,uint64,uint64,uint8,bytes32,address,address)",
  "event RequestFulfilled(uint256 indexed requestId, address indexed operator, bytes32 outputHash, bytes output)",
  "event RequestSent(uint256 indexed requestId, address indexed requester, bytes32 indexed modelId, bytes32 inputHash, bytes input, address callbackContract)",
];
const MODELS_ABI = ["function models(bytes32) view returns (uint256,bytes32,string,bool)"];
const coordinator = new Contract(cfg.coordinator, COORD_ABI, wallet);
const models = cfg.models !== "0x0000000000000000000000000000000000000000"
  ? new Contract(cfg.models, MODELS_ABI, provider) : null;
const abi = AbiCoder.defaultAbiCoder();

function loadUsage() {
  try { return JSON.parse(readFileSync(cfg.stateFile, "utf8")); } catch { return {}; }
}
function saveUsage(u) {
  mkdirSync(dirname(cfg.stateFile), { recursive: true });
  writeFileSync(cfg.stateFile, JSON.stringify(u));
}
const usage = loadUsage();

const modelIdOf = (name) => keccak256(toUtf8Bytes(name.includes(":") ? name : `${name}:v1`));

async function getPrice(modelName) {
  const id = modelIdOf(modelName);
  const m = await models.models(id);
  if (!m[3]) throw Object.assign(new Error("model unknown/inactive"), { status: 400 });
  return { id, price: m[0], backend: m[2] };
}

async function waitFulfill(requestId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await coordinator.requests(requestId);
    const s = Number(r[8]);
    if (s === 1 || s === 4) return r;
    if (s === 2 || s === 3) throw Object.assign(new Error(`request ended status ${s}`), { status: 502 });
    await new Promise((r2) => setTimeout(r2, 2500));
  }
  throw Object.assign(new Error("timeout awaiting fulfillment"), { status: 504 });
}

const MAX_PROMPT_CHARS = 4_000;
const MAX_INPUT_BYTES = 16 * 1024;

async function handleQuery(req, res, key) {
  const body = await readBody(req, 64 * 1024);
  let parsed;
  try {
    parsed = JSON.parse(body || "{}");
  } catch {
    return json(res, 400, { error: "invalid JSON body" });
  }
  const { model, prompt, input, wait = true } = parsed;
  if (!model || (!prompt && !input)) return json(res, 400, { error: "need {model, prompt|input}" });
  if (typeof prompt === "string" && prompt.length > MAX_PROMPT_CHARS)
    return json(res, 400, { error: `prompt too large (max ${MAX_PROMPT_CHARS} chars)` });
  if (input !== undefined && (typeof input !== "string" || (input.length - 2) / 2 > MAX_INPUT_BYTES))
    return json(res, 400, { error: `input too large (max ${MAX_INPUT_BYTES} bytes)` });

  const { id, price } = await getPrice(model);
  const payload = input ?? abi.encode(["string"], [prompt]);
  const tx = await coordinator.request(id, payload, "0x0000000000000000000000000000000000000000", 0, { value: price });
  const receipt = await tx.wait();
  // tx.wait() resolves on a reverted tx too - check before billing the key.
  if (!receipt || receipt.status === 0) {
    throw Object.assign(new Error(`request tx ${tx.hash} reverted`), { status: 502 });
  }
  const reqLog = receipt.logs.map((l) => { try { return coordinator.interface.parseLog(l); } catch { return null; } })
    .find((x) => x?.name === "RequestSent");
  const requestId = reqLog?.args?.requestId?.toString();
  if (!requestId) {
    throw Object.assign(new Error(`RequestSent missing in ${tx.hash}`), { status: 502 });
  }

  charge(key);
  if (!wait) return json(res, 202, { requestId, requestTx: tx.hash });

  const r = await waitFulfill(BigInt(requestId), cfg.syncTimeoutMs);
  const fulfilled = await coordinator.queryFilter(coordinator.filters.RequestFulfilled(requestId), 0);
  const output = fulfilled[0]?.args?.output;
  const text = output ? abi.decode(["string"], output)[0] : null;
  json(res, 200, {
    requestId, requestTx: tx.hash, fulfillTx: fulfilled[0]?.transactionHash,
    outputHash: r[9], operator: r[10], result: text,
  });
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((ok, no) => {
    let d = "";
    req.on("data", (c) => {
      d += c;
      if (d.length > limit) { no(Object.assign(new Error("body too large"), { status: 413 })); req.destroy(); }
    });
    req.on("end", () => ok(d));
    req.on("error", no);
  });
}
function charge(key) {
  usage[key] = (usage[key] ?? 0) + 1;
  saveUsage(usage);
}

// --- refund sweeper ---------------------------------------------------------
// The gateway funds escrow from its own wallet. If the operator never serves
// a request, the fee sits locked until refundIfTimedOut is called - it's
// permissionless, so we call it ourselves on a loop.
async function sweepRefunds() {
  try {
    const timeout = await coordinator.requestTimeout();
    const head = await provider.getBlockNumber();
    const logs = await coordinator.queryFilter(
      coordinator.filters.RequestSent(null, wallet.address),
      Math.max(0, head - 200_000)
    );
    const now = Math.floor(Date.now() / 1000);
    for (const l of logs) {
      const r = await coordinator.requests(l.args.requestId);
      if (Number(r.status) === 0 && now > Number(r.createdAt) + Number(timeout)) {
        const tx = await coordinator.refundIfTimedOut(l.args.requestId);
        await tx.wait();
        console.log(`refund swept for request ${l.args.requestId} tx ${tx.hash}`);
      }
    }
  } catch (e) {
    console.error(`sweeper error: ${e.message?.slice(0, 160)}`);
  }
}
setInterval(sweepRefunds, 60_000);
function json(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/v1/health") return json(res, 200, { ok: true });
    if (req.method === "GET" && req.url === "/v1/models" && models) {
      return json(res, 200, { note: "query models via registry", address: cfg.models });
    }
    if (req.method === "POST" && req.url === "/v1/query") {
      const key = req.headers["x-api-key"];
      if (!key) return json(res, 401, { error: "x-api-key required" });
      const quota = quotas.get(key);
      if (quota === undefined) return json(res, 403, { error: "invalid api key" });
      if ((usage[key] ?? 0) >= quota) return json(res, 402, { error: "quota exhausted - top up" });
      return await handleQuery(req, res, key);
    }
    if (req.method === "GET" && req.url?.startsWith("/v1/result/")) {
      let id;
      try {
        id = BigInt(req.url.split("/").pop() ?? "");
      } catch {
        return json(res, 400, { error: "invalid request id" });
      }
      const r = await coordinator.requests(id);
      const s = Number(r[8]);
      if (s === 1 || s === 4) {
        const logs = await coordinator.queryFilter(coordinator.filters.RequestFulfilled(id), 0);
        const out = logs[0]?.args?.output;
        return json(res, 200, { requestId: String(id), status: s, result: out ? abi.decode(["string"], out)[0] : null });
      }
      return json(res, 200, { requestId: String(id), status: s, result: null });
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, e.status ?? 500, { error: e.message?.slice(0, 200) });
  }
});

server.listen(cfg.port, () => console.log(`gateway on :${cfg.port} - wallet ${wallet.address}`));
