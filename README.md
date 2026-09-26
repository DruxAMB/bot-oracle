# bot-oracle

The AI compute oracle for BOT Chain. Contracts request inference, off-chain
operator nodes run the models, results land back on-chain — fees flowing
through the protocol. Ships with its own demand: Sentinel, an autonomous
consumer that pays for scheduled analyses and stores them on-chain.

## Layout

| Dir | What |
|---|---|
| `contracts/` | Foundry project — coordinator, registries, Sentinel, tests (17 passing) |
| `node/` | Oracle node — getLogs-poller, model backends, fulfiller, Sentinel keeper |
| `gateway/` | HTTP API — `POST /v1/query`, API keys + usage metering |
| `packages/sdk/` | `@bot-oracle/sdk` — request / awaitResult / verifyResult |
| `app/` | Next.js dashboard + docs |
| `starter/` | Clonable consumer template for integrators |
| `scripts/` | Chain recon + spike probes (RPC, WS, BDEX, deploy, getLogs) |
| `SPEC.md` | Architecture, monetization, phases, decisions log, deployments |

## Networks

| | Mainnet | Testnet |
|---|---|---|
| Chain ID | 677 | 968 |
| RPC | `https://rpc.botchain.ai` | `https://rpc.bohr.life` |
| Explorer | `https://scan.botchain.ai` | `https://scan.bohr.life` |

## Quickstart (testnet)

```bash
cd contracts && forge install --no-git foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts
forge test                        # 17 tests

cd ../node && npm i
OPERATOR_KEY=<funded-key> COORDINATOR_ADDRESS=<addr> MODELS_ADDRESS=<addr> \
RPC_URL=https://rpc.bohr.life CHAIN_ID=968 node src/index.js

cd ../gateway && npm i
GATEWAY_KEY=<funded-key> COORDINATOR_ADDRESS=<addr> MODELS_ADDRESS=<addr> \
GATEWAY_KEYS="yourkey:100" node src/index.js
curl -X POST localhost:8791/v1/query -H "x-api-key: yourkey" \
  -H "content-type: application/json" -d '{"model":"echo","prompt":"hi"}'
```

## Trust model (v1)

Single staked operator, slashable via a challenge window — honest
centralization, documented. Multi-operator consensus then TEE/opML proofs are
the roadmap. See `SPEC.md` §3.4.
