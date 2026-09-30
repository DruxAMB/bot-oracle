// Testnet deploy spike: compile + deploy SpikePing, emit an event, fetch it via eth_getLogs.
// Validates: RPC writes, gas costs, event pipeline (the oracle's core dependency).
import { JsonRpcProvider, Wallet, ContractFactory, Contract, solidityPackedKeccak256 } from "ethers";
import { readFileSync } from "node:fs";
import solc from "solc";

const RPC = "https://rpc.bohr.life";
const CHAIN_ID = 968;

const SRC = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract SpikePing {
    event Pinged(address indexed sender, uint256 indexed seq, bytes32 payloadHash);
    uint256 public seq;
    function ping(bytes32 payloadHash) external returns (uint256) {
        emit Pinged(msg.sender, ++seq, payloadHash);
        return seq;
    }
}`;

const compiled = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: { "SpikePing.sol": { content: SRC } },
      settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } } },
    })
  )
);
const c = compiled.contracts["SpikePing.sol"].SpikePing;

const burner = JSON.parse(readFileSync(new URL("./.burner.json", import.meta.url), "utf8"));
const provider = new JsonRpcProvider(RPC, CHAIN_ID);
const wallet = new Wallet(burner.privateKey, provider);

const bal = await provider.getBalance(wallet.address);
console.log(`balance: ${bal} wei (${Number(bal) / 1e18} tBOT)`);
if (bal === 0n) {
  console.log("UNFUNDED - claim tBOT at https://faucet.botchain.ai/en/basic then re-run.");
  process.exit(1);
}

const factory = new ContractFactory(c.abi, c.evm.bytecode.object, wallet);
const deployTx = await factory.deploy();
console.log(`deploy tx: ${deployTx.deploymentTransaction().hash}`);
const contract = await deployTx.waitForDeployment();
const deployReceipt = await deployTx.deploymentTransaction().wait();
const addr = await contract.getAddress();
console.log(`deployed: ${addr}`);
console.log(`deploy gas: ${deployReceipt.gasUsed} (fee ${deployReceipt.gasUsed * deployReceipt.gasPrice} wei)`);

const payload = solidityPackedKeccak256(["string"], ["spike-0"]);
const pingTx = await contract.ping(payload);
const pingReceipt = await pingTx.wait();
console.log(`ping tx: ${pingTx.hash}  gas: ${pingReceipt.gasUsed}`);

// The critical leg: retrieve the emitted event via eth_getLogs (the oracle's event pipeline).
const logs = await provider.getLogs({
  address: addr,
  topics: [contract.interface.getEvent("Pinged").topicHash],
  fromBlock: pingReceipt.blockNumber,
  toBlock: "latest",
});
console.log(`getLogs events found: ${logs.length}`);
if (logs.length) console.log(`  log[0] topics: ${JSON.stringify(logs[0].topics)}`);

console.log(`\nexplorer: https://scan.bohr.life/address/${addr}`);
console.log("SPIKE RESULT: deploy+emit+getLogs loop", logs.length ? "VERIFIED" : "FAILED");
