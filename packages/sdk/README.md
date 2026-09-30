# @bot-oracle/sdk

Thin client for the BOT Chain AI oracle. `request()` escrows the fee on-chain,
the operator runs inference off-chain, `awaitResult()` resolves when the
result is written back, `verifyResult()` recomputes the on-chain output hash.

```js
import { JsonRpcProvider, Wallet } from "ethers";
import { OracleClient } from "@bot-oracle/sdk";

const signer = new Wallet(process.env.KEY, new JsonRpcProvider(RPC_URL, CHAIN_ID));

const o = new OracleClient({ rpcUrl, chainId, coordinator, models, signer });
const modelId = OracleClient.modelId("echo:v1");

const value = await o.priceOf(modelId);                       // exact fee
const { requestId, txHash } = await o.request({ modelId, prompt: "hello", value });
const meta = await o.awaitResult(requestId);                  // polls until fulfilled
const text = await o.getResult(requestId);                    // decoded string output
const ok = await o.verifyResult(requestId, text);             // recompute outputHash
```

## API

| Method | What it does |
|---|---|
| `OracleClient.modelId("echo:v1")` | `keccak256("name:version")`: the registry's id convention |
| `OracleClient.encodePrompt(text)` | ABI-encode a plain-text prompt for `input` |
| `priceOf(modelId)` | Model's per-query price in wei; pass as `value` |
| `request({modelId, prompt \| input, callbackContract?, callbackGas?, value})` | Sends the paid request; returns `{ requestId, txHash }`. Throws on revert or missing event. |
| `awaitResult(requestId, {timeoutMs, pollMs})` | Resolves `{ requestId, status, outputHash, operator }` on FULFILLED/RESOLVED; throws on REFUNDED/DISPUTED/timeout |
| `getResult(requestId)` | Decoded string output from the `RequestFulfilled` event |
| `verifyResult(requestId, text)` | Recomputes `keccak256(abi.encode(string, text))` vs on-chain `outputHash` |

For contract callbacks, implement `IOracleConsumer` (`@bot-oracle/sdk/solidity`)
and pass `callbackContract` + `callbackGas`.

## Testnet

| | |
|---|---|
| Chain | BOT Chain Testnet · id `968` |
| RPC | `https://rpc.bohr.life` |
| Coordinator | `0x4861Ff97A82436d64514C0B119c4796F46a4d8Da` |
| ModelRegistry | `0xb208fb3016c14b0946bf3FBbe1Def28d72F63193` |
| Explorer | `https://scan.bohr.life` |
| Faucet | `https://faucet.botchain.ai/en/basic` |

Contracts are source-verified on the explorer. Repo, docs and live dashboard:
[github.com/DruxAMB/bot-oracle](https://github.com/DruxAMB/bot-oracle)

## Smoke test

A real on-chain round trip (costs one model fee + gas):

```sh
node --env-file=../../node/.env.testnet test/smoke.mjs
```

MIT © DruxAMB
