# oracle-consumer-starter

The minimal contract + flow for consuming the BOT Chain AI oracle. Clone, deploy, fund, call.

## On-chain (BOT Chain testnet, chain 968)

| Contract | Address |
|---|---|
| OracleCoordinator | `0x4861Ff97A82436d64514C0B119c4796F46a4d8Da` |
| ModelRegistry | `0xb208fb3016c14b0946bf3FBbe1Def28d72F63193` |
| OperatorRegistry | `0xf22dA276EAA3c4de433115a95111907A6338D3A5` |
| Sentinel (demo consumer) | `0x1ea8e8429Ecae0Dfa8dEbb93983DDe93EA31a014` |

## The pattern (see `Consumer.sol`)

1. **Deploy** your consumer with the coordinator address, a `modelId`
   (`keccak256("name:version")`, e.g. `keccak256("echo:v1")` on testnet), and
   the model's price in wei.
2. **Fund** it: the contract pays each query's fee from its own balance.
3. **Call** `ask(input)`: input is `abi.encode(string)` of your prompt for the
   stock models.
4. **Receive** `onOracleResult(requestId, output)`: the coordinator calls back
   within a few seconds; `output` is `abi.encode(string)`.

Gas guidance: give the callback `300_000` gas minimum if you store results -
string SSTOREs scale with length. If the callback reverts the fulfill still
lands (`CallbackResult` event = false) and your result is retrievable from the
`RequestFulfilled` event.

## Off-chain (JS/TS)

```js
import { OracleClient } from "@bot-oracle/sdk";

const client = new OracleClient({
  rpcUrl: "https://rpc.bohr.life",
  chainId: 968,
  coordinator: "0x4861Ff97A82436d64514C0B119c4796F46a4d8Da",
  signer, // your funded wallet
});

const { requestId } = await client.request({
  modelId: OracleClient.modelId("echo:v1"),
  prompt: "your prompt here",
  value: priceWei, // ModelRegistry.models(modelId).priceWei
});
const { outputHash } = await client.awaitResult(requestId);
const text = await client.getResult(requestId);
```

## Models on testnet

| modelId | backend | price |
|---|---|---|
| `echo:v1` | local echo (pipeline tests, no LLM) | 0.001 tBOT |
| `gpt-4o-mini:v1` | OpenAI passthrough (needs node OPENAI_API_KEY) | 0.005 tBOT |
