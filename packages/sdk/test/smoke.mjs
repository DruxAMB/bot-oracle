// Live smoke test for @bot-oracle/sdk - runs a REAL request through the
// package's own code path against the deployed testnet coordinator.
// Costs one model fee (0.001 tBOT) + gas. Run:
//   node --env-file=../../node/.env.testnet test/smoke.mjs
import { JsonRpcProvider, Wallet } from "ethers";
import { OracleClient } from "@bot-oracle/sdk";

const required = ["RPC_URL", "CHAIN_ID", "COORDINATOR_ADDRESS", "MODELS_ADDRESS", "OPERATOR_KEY"];
for (const k of required) if (!process.env[k]) throw new Error(`missing env ${k}`);

const provider = new JsonRpcProvider(process.env.RPC_URL, Number(process.env.CHAIN_ID));
const signer = new Wallet(process.env.OPERATOR_KEY, provider);

const o = new OracleClient({
  rpcUrl: process.env.RPC_URL,
  chainId: Number(process.env.CHAIN_ID),
  coordinator: process.env.COORDINATOR_ADDRESS,
  models: process.env.MODELS_ADDRESS,
  signer,
});

const modelId = OracleClient.modelId("echo:v1");
const prompt = `sdk smoke ${Date.now()}`;

console.log("priceOf…");
const value = await o.priceOf(modelId);
console.log("  echo:v1 price:", value.toString(), "wei");

console.log("request…");
const { requestId, txHash } = await o.request({ modelId, prompt, value });
console.log(`  requestId #${requestId} tx ${txHash}`);

console.log("awaitResult…");
const meta = await o.awaitResult(requestId, { timeoutMs: 120_000 });
console.log(`  fulfilled by ${meta.operator} outputHash ${meta.outputHash}`);

const text = await o.getResult(requestId);
console.log("getResult:", JSON.stringify(text));
if (text !== `echo:${prompt}`) throw new Error(`unexpected result: ${text}`);

const ok = await o.verifyResult(requestId, text);
console.log("verifyResult:", ok);
if (!ok) throw new Error("outputHash mismatch");

console.log("\nPASS - SDK request → awaitResult → getResult → verifyResult all live on-chain");
