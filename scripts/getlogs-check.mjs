// Verify eth_getLogs retrieves the Pinged event from the deployed SpikePing.
import { JsonRpcProvider, id } from "ethers";

const RPC = "https://rpc.bohr.life";
const ADDR = "0x1C8695E71faB85fFdd4C0c5ac588Ef6a3EFF5B62";
const PING_TX = "0x5483313181e17b6604c53409b57cf6a8502f02f9da86cd89015139aacd55df09";

const provider = new JsonRpcProvider(RPC, 968);
const tx = await provider.getTransaction(PING_TX);
const topic = id("Pinged(address,uint256,bytes32)");
const logs = await provider.getLogs({ address: ADDR, topics: [topic], fromBlock: tx.blockNumber, toBlock: "latest" });

console.log(`Pinged events found: ${logs.length}`);
for (const l of logs) console.log(`  block ${l.blockNumber} tx ${l.transactionHash} seq=${BigInt(l.topics[2])} payload=${l.topics[3]}`);
console.log("EVENT PIPELINE:", logs.length ? "VERIFIED" : "FAILED");
