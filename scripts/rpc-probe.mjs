// Read-only RPC recon for BOT Chain mainnet + testnet. No deps, no keys, no funds.
const ENDPOINTS = [
  { name: "mainnet-677", url: "https://rpc.botchain.ai" },
  { name: "testnet-968", url: "https://rpc.bohr.life" },
];

const CALLS = [
  ["eth_chainId"],
  ["net_version"],
  ["eth_blockNumber"],
  ["eth_gasPrice"],
  ["eth_maxPriorityFeePerGas"],
  ["web3_clientVersion"],
  ["eth_syncing"],
];

async function rpc(url, method, params = []) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = await res.json();
  if (j.error) return `ERR ${j.error.code}: ${j.error.message}`;
  return j.result;
}

for (const ep of ENDPOINTS) {
  console.log(`\n=== ${ep.name} (${ep.url}) ===`);
  for (const [method, params] of CALLS) {
    try {
      const r = await rpc(ep.url, method, params ?? []);
      const v =
        typeof r === "string" && r.startsWith("0x") && /^\d+$/.test(r.slice(2))
          ? `${r} (${BigInt(r)})`
          : JSON.stringify(r);
      console.log(`  ${method.padEnd(32)} ${v}`);
    } catch (e) {
      console.log(`  ${method.padEnd(32)} FETCH-FAIL ${e.message}`);
    }
  }
  // getLogs probe - is it disabled here?
  try {
    const r = await rpc(ep.url, "eth_getLogs", [
      { fromBlock: "latest", toBlock: "latest" },
    ]);
    console.log(`  ${"eth_getLogs (probe)".padEnd(32)} ${JSON.stringify(r).slice(0, 200)}`);
  } catch (e) {
    console.log(`  ${"eth_getLogs (probe)".padEnd(32)} FETCH-FAIL ${e.message}`);
  }
  // fee history - EIP-1559 support check
  try {
    const r = await rpc(ep.url, "eth_feeHistory", ["0x5", "latest", []]);
    console.log(`  ${"eth_feeHistory (5)".padEnd(32)} ${JSON.stringify(r).slice(0, 200)}`);
  } catch (e) {
    console.log(`  ${"eth_feeHistory (5)".padEnd(32)} FETCH-FAIL ${e.message}`);
  }
}
