// Registers the sentinel:v1 intel model on ModelRegistry and points the
// deployed Sentinel at it via setQuery. Testnet burner only.
import { JsonRpcProvider, Wallet, Contract, id, parseEther, formatEther, keccak256, toUtf8Bytes } from "ethers";
import { readFileSync } from "node:fs";

const RPC = process.env.RPC_URL ?? "https://rpc.bohr.life";
const CHAIN_ID = Number(process.env.CHAIN_ID ?? "968");
const MODELS = "0x8f487264E1B183F588CAc678D000754D3bd9B07E";
const SENTINEL = "0x0245cc872b5F51197dDE6E0dc3b7A21a3c55F787";

const key = JSON.parse(readFileSync(new URL("./.burner.json", import.meta.url))).privateKey;
const provider = new JsonRpcProvider(RPC, CHAIN_ID);
const wallet = new Wallet(key, provider);

const models = new Contract(MODELS, [
  "function setModel(bytes32,uint256,bytes32,string,bool)",
  "function models(bytes32) view returns (uint256,bytes32,string,bool)",
], wallet);
const sentinel = new Contract(SENTINEL, [
  "function setQuery(bytes32,uint256)",
  "function modelId() view returns (bytes32)",
  "function queryPrice() view returns (uint256)",
], wallet);

const modelId = id("sentinel:v1"); // keccak256 of the label
const containerHash = keccak256(toUtf8Bytes("bot-oracle-sentinel-backend:v1"));
const price = parseEther("0.001");

console.log("modelId:", modelId);
const tx1 = await models.setModel(modelId, price, containerHash, "sentinel:v1", true);
console.log("setModel tx:", tx1.hash);
await tx1.wait();
const m = await models.models(modelId);
console.log("registered:", { priceWei: m[0].toString(), backend: m[2], active: m[3] });

const tx2 = await sentinel.setQuery(modelId, price);
console.log("setQuery tx:", tx2.hash);
await tx2.wait();
console.log("sentinel.modelId:", await sentinel.modelId(), "price:", formatEther(await sentinel.queryPrice()));
