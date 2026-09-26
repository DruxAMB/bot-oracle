// Read-only BDEX probe — verifies DEX contracts respond and measures REAL pool liquidity.
// No funds needed. Covers testnet (968) and mainnet (677).
import { JsonRpcProvider, Contract, formatUnits, formatEther } from "ethers";

const ERC20 = ["function name() view returns (string)", "function symbol() view returns (string)", "function decimals() view returns (uint8)", "function totalSupply() view returns (uint256)"];
const FACTORY = ["function allPairsLength() view returns (uint256)", "function getPair(address,address) view returns (address)", "function feeTo() view returns (address)"];
const PAIR = ["function getReserves() view returns (uint112,uint112,uint32)", "function token0() view returns (address)", "function token1() view returns (address)"];

const NETS = {
  mainnet: {
    rpc: "https://rpc.botchain.ai", chainId: 677,
    factory: "0x117115f3B72C8d1989178089A67D0C26f8EE0AA3",
    router: "0x1414eD29FdFD322c3c0a830330ed982E2D629e76",
    wbot: "0xD5452816194a3784dBa983426cCe7c122F4abd30",
    usdt: "0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C",
  },
  testnet: {
    rpc: "https://rpc.bohr.life", chainId: 968,
    factory: "0x65b8e98ceA190d8c28B3e4716402027f634d15a3",
    router: "0xD6425a02f0845B8D99e349C34D2E7A576E177345",
    wbot: "0xD5452816194a3784dBa983426cCe7c122F4abd30",
    usdt: "0x75edC9335175Fc0552D51D48439F229c10420fe3",
  },
};

for (const [name, n] of Object.entries(NETS)) {
  console.log(`\n=== ${name} (${n.rpc}) ===`);
  const p = new JsonRpcProvider(n.rpc, n.chainId);
  try {
    const wbot = new Contract(n.wbot, ERC20, p);
    const usdt = new Contract(n.usdt, ERC20, p);
    console.log(`WBOT: ${await wbot.name()} / ${await wbot.symbol()} / supply ${formatEther(await wbot.totalSupply())}`);
    const [un, us, ud, uts] = await Promise.all([usdt.name(), usdt.symbol(), usdt.decimals(), usdt.totalSupply()]);
    console.log(`USDT: ${un} / ${us} / dec ${ud} / supply ${formatUnits(uts, ud)}`);

    const fac = new Contract(n.factory, FACTORY, p);
    const npairs = await fac.allPairsLength();
    console.log(`V2 pairs: ${npairs}`);
    const pairAddr = await fac.getPair(n.wbot, n.usdt);
    console.log(`WBOT/USDT pair: ${pairAddr}`);
    if (pairAddr !== "0x0000000000000000000000000000000000000000") {
      const pair = new Contract(pairAddr, PAIR, p);
      const [r0, r1] = await pair.getReserves();
      const t0 = (await pair.token0()).toLowerCase();
      const [wres, ures] = t0 === n.wbot.toLowerCase() ? [r0, r1] : [r1, r0];
      console.log(`reserves: ${formatEther(wres)} WBOT / ${formatUnits(ures, ud)} USDT`);
      if (ures > 0n) console.log(`implied WBOT price: $${(Number(formatUnits(ures, ud)) / Number(formatEther(wres))).toFixed(4)}`);
    }
  } catch (e) {
    console.log(`  FAIL: ${e.message.slice(0, 160)}`);
  }
}
