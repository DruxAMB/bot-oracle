// Generate a testnet-only burner wallet. Writes scripts/.burner (gitignored later).
import { Wallet } from "ethers";
import { writeFileSync } from "node:fs";

const w = Wallet.createRandom();
const out = {
  address: w.address,
  // Testnet-only. NEVER fund this key on mainnet, never commit this file.
  privateKey: w.privateKey,
  network: "botchain-testnet-968",
  created: new Date().toISOString(),
};
writeFileSync(new URL("./.burner.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("burner address:", w.address);
console.log("faucet: https://faucet.botchain.ai/en/basic  (claim 10 tBOT, CAPTCHA required)");
