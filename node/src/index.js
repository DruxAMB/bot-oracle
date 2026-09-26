// bot-oracle node — v1
// Polls RequestSent events via eth_getLogs (primary path per SPEC §3.3),
// runs inference via the model's registered backend, fulfills on-chain.
// Restart-safe: pending set is rebuilt from on-chain state every boot.
import { JsonRpcProvider, Wallet, Contract, AbiCoder, id as eventId, getAddress } from "ethers";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { runInference } from "./backends.js";

const cfg = {
  rpc: process.env.RPC_URL ?? "https://rpc.bohr.life",
  chainId: Number(process.env.CHAIN_ID ?? "968"),
  coordinator: getAddress(process.env.COORDINATOR_ADDRESS ?? "0x0000000000000000000000000000000000000000"),
  models: getAddress(process.env.MODELS_ADDRESS ?? "0x0000000000000000000000000000000000000000"),
  operatorKey: process.env.OPERATOR_KEY,
  pollMs: Number(process.env.POLL_INTERVAL_MS ?? "3000"),
  stateFile: process.env.STATE_FILE ?? "./state/last-block.json",
  confirmBlocks: Number(process.env.CONFIRM_BLOCKS ?? "1"),
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL,
  },
};
if (!cfg.operatorKey) throw new Error("OPERATOR_KEY env required");
if (cfg.coordinator === "0x0000000000000000000000000000000000000000")
  throw new Error("COORDINATOR_ADDRESS env required");

const provider = new JsonRpcProvider(cfg.rpc, cfg.chainId);
const operator = new Wallet(cfg.operatorKey, provider);

const COORD_ABI = [
  "function fulfill(uint256 requestId, bytes calldata output)",
  "function requests(uint256) view returns (address requester, bytes32 modelId, bytes32 inputHash, uint256 fee, address callbackContract, uint64 callbackGasLimit, uint64 createdAt, uint64 fulfilledAt, uint8 status, bytes32 outputHash, address operator, address challenger)",
  "event RequestSent(uint256 indexed requestId, address indexed requester, bytes32 indexed modelId, bytes32 inputHash, bytes input, address callbackContract)",
];
const MODELS_ABI = ["function models(bytes32) view returns (uint256 priceWei, bytes32 containerHash, string backend, bool active)"];
const SENTINEL_ABI = ["function tick() payable returns (uint256)"];
const coordinator = new Contract(cfg.coordinator, COORD_ABI, operator);
const models = new Contract(cfg.models, MODELS_ABI, provider);
const abi = AbiCoder.defaultAbiCoder();

const T_REQUEST = eventId("RequestSent(uint256,address,bytes32,bytes32,bytes,address)");
const T_FULFILL = eventId("RequestFulfilled(uint256,address,bytes32,bytes)");
const T_REFUND = eventId("RequestRefunded(uint256,address,uint256)");
const T_RESOLVED = eventId("ChallengeResolved(uint256,bool)");
const TOPICS = [T_REQUEST, T_FULFILL, T_REFUND, T_RESOLVED];

const pending = new Map(); // requestId -> {modelId, input}
const inflight = new Set();

function loadState() {
  try { return JSON.parse(readFileSync(cfg.stateFile, "utf8")); } catch { return {}; }
}
function saveState(s) {
  mkdirSync(dirname(cfg.stateFile), { recursive: true });
  const tmp = cfg.stateFile + ".tmp";
  writeFileSync(tmp, JSON.stringify(s));
  // atomic-ish rename
  try { writeFileSync(cfg.stateFile, readFileSync(tmp)); } catch {}
}

async function processRange(from, to) {
  const logs = await provider.getLogs({ address: cfg.coordinator, topics: [TOPICS], fromBlock: from, toBlock: to });
  for (const log of logs) {
    const t = log.topics[0];
    const requestId = BigInt(log.topics[1]);
    if (t === T_REQUEST) {
      const decoded = abi.decode(["bytes32", "bytes", "address"], log.data); // inputHash, input, callbackContract
      // topics: [sig, requestId, requester, modelId] — modelId is topics[3]
      pending.set(requestId, { modelId: log.topics[3], input: decoded[1] });
    } else {
      pending.delete(requestId);
    }
  }
}

async function serve(requestId, job) {
  if (inflight.has(requestId)) return;
  inflight.add(requestId);
  try {
    // still pending on-chain? (operator may have restarted mid-fulfill)
    const r = await coordinator.requests(requestId);
    if (Number(r.status) !== 0) { pending.delete(requestId); return; }

    const m = await models.models(job.modelId);
    if (!m.active) { console.log(`#${requestId} model inactive, waiting`); return; } // stays pending; misconfig shouldn't drop jobs

    console.log(`#${requestId} inference via ${m.backend}`);
    const text = await runInference(m.backend, job.input, cfg);
    // Cap output size — a consumer's callback pays storage gas per byte; an
    // unbounded backend response can price the callback into OutOfGas.
    const capped = text.length > 2000 ? text.slice(0, 2000) : text;
    const output = abi.encode(["string"], [capped]);

    const tx = await coordinator.fulfill(requestId, output);
    console.log(`#${requestId} fulfill tx ${tx.hash}`);
    await tx.wait();
    pending.delete(requestId);
    console.log(`#${requestId} fulfilled`);
  } catch (e) {
    // transient (RPC, nonce, backend) — retry next round; permanent reverts log loudly
    console.error(`#${requestId} serve error: ${e.message?.slice(0, 200)}`);
  } finally {
    inflight.delete(requestId);
  }
}

const state = loadState();
const lookback = Number(process.env.LOOKBACK_BLOCKS ?? "1000");
const head0 = await provider.getBlockNumber();
// On boot, re-scan a lookback window so requests left Pending through a
// restart (or missed while down) are rediscovered from the event log.
let lastBlock = Math.max(0, (state.lastBlock ?? head0) - lookback);
console.log(`node up — operator ${operator.address}, coordinator ${cfg.coordinator}, rescanning from block ${lastBlock}`);

async function tick() {
  try {
    const head = await provider.getBlockNumber();
    const safeHead = head - cfg.confirmBlocks;
    if (safeHead > lastBlock) {
      await processRange(lastBlock + 1, safeHead);
      lastBlock = safeHead;
      state.lastBlock = lastBlock;
      saveState(state);
    }
    for (const [id, job] of pending) await serve(id, job);
  } catch (e) {
    console.error(`tick error: ${e.message?.slice(0, 160)}`);
  }
}
setInterval(tick, cfg.pollMs);
await tick();

// --- optional Sentinel keeper ---
// SENTINEL_ADDRESS set => this node also fires tick() on cadence; the query
// fee comes from Sentinel's own funded balance, the keeper pays gas only.
if (process.env.SENTINEL_ADDRESS) {
  const sentinel = new Contract(getAddress(process.env.SENTINEL_ADDRESS), SENTINEL_ABI, operator);
  const everyMs = Number(process.env.SENTINEL_INTERVAL_MS ?? "300000");
  const fire = async () => {
    try {
      const tx = await sentinel.tick();
      console.log(`sentinel tick tx ${tx.hash}`);
      await tx.wait();
    } catch (e) {
      // TooEarly / underfunded are routine — log once per fire, keep going
      console.log(`sentinel tick skipped: ${(e.shortMessage ?? e.message)?.slice(0, 80)}`);
    }
  };
  setInterval(fire, everyMs);
  console.log(`sentinel keeper armed on ${await sentinel.getAddress()} every ${everyMs}ms`);
  // don't fire immediately — respect the on-chain interval
}
