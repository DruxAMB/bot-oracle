// WS + registry recon: does BOT Chain expose WebSocket RPC anywhere?
const candidates = [
  "wss://rpc.botchain.ai",
  "wss://rpc.bohr.life",
  "wss://ws.botchain.ai",
  "ws://rpc.botchain.ai",
];

function tryWs(url) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(`${url}: TIMEOUT`), 8_000);
    try {
      const ws = new WebSocket(url);
      ws.onopen = () => {
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }));
      };
      ws.onmessage = (e) => {
        clearTimeout(t);
        resolve(`${url}: OPEN -> ${String(e.data).slice(0, 120)}`);
        ws.close();
      };
      ws.onerror = (err) => {
        clearTimeout(t);
        resolve(`${url}: ERR ${err.message || "connect failed"}`);
      };
    } catch (e) {
      clearTimeout(t);
      resolve(`${url}: THROW ${e.message}`);
    }
  });
}

for (const u of candidates) console.log(await tryWs(u));

// chainid.network registry — what RPCs are officially listed for 677/968?
try {
  const res = await fetch("https://chainid.network/chains.json");
  const chains = await res.json();
  for (const id of [677, 968]) {
    const c = chains.find((x) => x.chainId === id);
    console.log(`\nchain ${id}:`, c ? JSON.stringify(c.rpc, null, 2) : "NOT REGISTERED");
  }
} catch (e) {
  console.log("chains.json fetch failed:", e.message);
}
