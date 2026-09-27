# BOT Chain AI Oracle — Spec & Plan

> Working title: **bot-oracle**. Naming TBD.
> Status: pre-build spec. Nothing here is committed yet; Phase 0 verifies the ground
> truth before any contract is written.

## 0. TL;DR

Build the first working AI compute oracle on BOT Chain: contracts request
inference, off-chain operator nodes run the models, results land back on-chain
with a fee flowing through the protocol. We ship the oracle **and** the first
apps that consume it, because on a chain with near-zero organic demand, infra
that waits for callers earns nothing.

Revenue: per-query fees (BOT/USDT) + protocol cut + metered off-chain API.
Strategic revenue: this product *is* the "vCompute layer" BOT Chain's roadmap
only promises — the strongest possible position for the $50M ecosystem fund and
the application-based support pool, which is where the real money lives.
Leaderboard rewards (max ~56 BOT/month + ~10 BOT/week) are pocket change —
treated as marketing, not income.

---

## 1. Verified chain facts (the substrate we build on)

| Fact | Value | Source |
|---|---|---|
| Mainnet | Chain ID 677, RPC `https://rpc.botchain.ai` | dev-docs quick-guide |
| Testnet | Chain ID 968, RPC `https://rpc.bohr.life` | dev-docs quick-guide |
| Consensus | Parlia (BNB-fork PoSA), FFG finality, EIP-4844 blobs, ERC-4337 + EIP-7702 | dev-docs json-rpc-endpoint, AA |
| `eth_getLogs` | Docs claim disabled on mainnet; **probe 2026-09-26: WORKS on both RPCs** (returned live Transfer logs) — keep fallback anyway | dev-docs vs rpc-probe.mjs |
| WBOT | `0xD5452816194a3784dBa983426cCe7c122F4abd30` | dev-docs DEX addresses |
| USDT (bridged) | `0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C` | dev-docs DEX addresses |
| BDEX V2 | Factory `0x1171…0AA3`, Router02 `0x1414…9e76` | dev-docs DEX addresses |
| BDEX V3 | Factory/Router/Quoter/NFPM deployed | dev-docs DEX addresses |
| Multicall3 / Permit2 / Universal Router | deployed | dev-docs DEX addresses |
| Node self-host | `github.com/bl-BOHR/node-deploy` — full/archive node instructions | dev-docs node-types |
| Real BOT price | ~$12.34 implied by on-chain pool ≈ Coinstore $12.38 — the *only* two venues, likely same MM | bdex-probe.mjs 2026-09-26 |
| Real DEX liquidity | **WBOT/USDT pool = 244.7 WBOT / $3,019 USDT ≈ $6k TVL; 29 V2 pairs total on mainnet** | bdex-probe.mjs 2026-09-26 |
| RPC truth | Mainnet live @ ~24.6M blocks, gas 20 gwei, baseFee 0, block utilization <1%, getLogs OK, **no public WS** | rpc-probe/ws-probe 2026-09-26 |
| Organic activity | Chain is live but essentially empty — CoinGecko's $1.5M/24h DEX volume on a $6k pool = wash | composite |

**Design consequences:**

- Event delivery cannot assume `eth_getLogs`. Primary path = WebSocket
  `eth_subscribe`; fallback = per-block receipt polling; nuclear option = our own
  node (they publish deploy scripts). **Verified in Phase 0 before anything else.**
- Fees should be payable in BOT *and* USDT. BOT-only pricing floats against a
  thin single-exchange market; USDT pricing gives stable billing.
- No Chainlink, no oracle infra, no competition. Greenfield.

---

## 2. What the product is

A request/response AI oracle:

```
Consumer contract ──request(modelId, input, fee)──▶ OracleCoordinator
                                                       │ emits RequestSent
                                          off-chain operator node listens
                                                       │ runs inference
Consumer contract ◀─callback(result, proof)── fulfill(requestId, output)
```

Plus a web2-facing gateway (`POST /v1/query`) that serves the same models with
on-chain result anchoring — this is where non-crypto users and other projects
pay without ever holding BOT.

Reference architecture in the wild: ORA's OAO/opML (optimistic AI oracle),
Ritual Infernet (router + subscription nodes), Chainlink Functions (DON model).
Ours is the pragmatic version: honest about v1 trust assumptions, designed so
the verification layer can deepen without breaking consumers.

---

## 3. Architecture

### 3.1 On-chain (Solidity, Foundry — matches `creditpass` precedent: Hardhat+TS ok)

**`OracleCoordinator.sol`** — the only contract consumers touch.

```solidity
function request(
    bytes32 modelId,
    bytes calldata input,          // prompt / encoded payload
    address callbackContract,      // may be address(0) for off-chain polling
    uint64 callbackGasLimit
) external payable returns (uint256 requestId);

function fulfill(
    uint256 requestId,
    bytes calldata output,
    bytes32 inputHash,             // keccak(modelId || input)
    bytes calldata nodeSig         // EIP-712 over (requestId, outputHash)
) external onlyOperator;

function refundIfTimedOut(uint256 requestId) external;
function challenge(uint256 requestId) external payable; // posts dispute bond
```

- Escrows the query fee at `request`; releases `fee − protocolCut` to the
  operator at `fulfill`; refunds on timeout.
- `fulfill` invokes `callbackContract.onOracleResult(requestId, output)` inside
  the same tx — consumer contracts see results atomically.
- Large outputs: `fulfill` stores `outputHash` on-chain and anchors the payload
  via an **EIP-4844 blob** (BOT Chain supports blob txs — a real differentiator
  vs. chains that can't; "inference results anchored as blobs" is a good line
  for the grant application).

**`OperatorRegistry.sol`** — operator stake, status, per-operator stats.

- v1: single operator (us), staked BOT, slashable on proven fraud.
- v2: multi-operator; request assigned to N operators, result accepted at
  threshold agreement (exact-match or median for scalar outputs).

**`ModelRegistry.sol`** — `modelId → {price, containerHash, backendType, active}`.
Prices set in USDT-terms; payable in BOT (converted at fulfill-time via BDEX
quote or an admin-set rate for v1) or USDT directly.

**`IOracleConsumer.sol`** — one-method interface integrators implement.

### 3.2 Off-chain

**`oracle-node`** (TypeScript, runs anywhere):
- Subscribes for `RequestSent` via WSS; falls back to block-polling.
- Model backends: local models (Ollama/vLLM) for the free tier; OpenAI/Anthropic
  passthrough for premium tiers. Signs every result (EIP-712) then `fulfill`s.
- Idempotent, restart-safe (SQLite/Postgres job table), records every call for
  the stats dashboard.

**`oracle-gateway`** (HTTP API):
- `POST /v1/query {model, input}` → JSON result + `requestId` + tx hash.
- Metered billing: API keys, USDT deposit or fiat. For users who want AI, not
  crypto — but every response can still anchor a hash on-chain (one batched tx
  per N responses keeps costs down while feeding the "all results anchored"
  story).

**`@bot-oracle/sdk`** — `request()`, `awaitResult()`, `verifyResult()`, plus
`OracleConsumer` base contract for Solidity integrators.

**Dashboard** (Next.js, in-repo): live feed of requests/results, per-model
volume, operator stats, fees collected. This page doubles as the leaderboard
listing's product link and the grant application's evidence.

### 3.3 Event delivery — verified against live RPCs (2026-09-26)

Spike results changed the plan: docs claim `eth_getLogs` is disabled on
mainnet, but the live probe returned real logs; **no public WebSocket endpoint
exists** (all wss/ws candidates fail handshake). Actual strategy:

1. **Primary: `eth_getLogs` polling** — works today on both RPCs. Poll per new
   head; treat any future disablement as a handled failure mode, not a surprise.
2. **Fallback: block-poll** — `eth_getBlockByNumber` + `eth_getTransactionReceipt`;
   works without getLogs; ~1s latency at Parlia block times is fine for the SLA.
3. **Nuclear: own node** — `bl-BOHR/node-deploy` exists. If public endpoints
   degrade, we run a fast node (500GB+ SSD) — later also a sellable private RPC
   for integrators.
4. Note: chain 677 is **not registered** on chainid.network, and 968 collides
   with an unrelated "Datagram" registration — sloppy ops data point; don't
   rely on third-party RPC aggregators existing for this chain.

### 3.4 Trust model — the honest ladder

| Phase | Model | What we promise |
|---|---|---|
| v1 | Single staked operator + deterministic replay challenge | "Staked, slashable, reproducible — operator pinned to a published container+model hash; anyone can post a bond and force re-execution" |
| v2 | N-of-M operators, threshold agreement | Byzantine-tolerant for single-operator faults |
| v3 | TEE attestation or opML-style fraud proofs | Verifiable inference; the roadmap target |

v1 ships with the centralization caveat written in the README — reviewers fund
honest architectures, and "vCompute today, verifiable vCompute on the roadmap"
is the grant pitch.

---

## 4. Monetization

| Stream | Mechanism | Notes |
|---|---|---|
| On-chain query fee | Per-request, model-tiered; protocol keeps ~10–15%, operator keeps rest | v1 operator = us → all fees internal |
| USDT subscription | Prepaid balance on coordinator; powers high-frequency consumers | Predictable revenue, fewer txs per top-up |
| Gateway API | Metered API keys (USDT/fiat) for off-chain users | Biggest real revenue path — no wallet friction |
| Dedicated operator slots | B2B: another project pays for its own pinned model/endpoint | Later phase; needs integrators to exist |
| Token (optional, later) | Fee-share token if/when traction exists | Explicitly deferred — not needed for v1, adds legal surface |

Pricing shape (calibrate after Phase 0 confirms real gas costs):
small model ≈ $0.02–0.05/query, large ≈ $0.10–0.30. The gateway margin is
inference-cost + gas amortization + protocol cut.

---

## 5. Demand bootstrap — ship the callers ourselves

An oracle with no consumers is a demo, not a business. We ship three things
that make it a business:

1. **Sentinel** (flagship consumer): an autonomous contract+node loop that runs
   a market-intelligence model over BDEX/ecosystem data on a schedule, posts
   analysis on-chain, feeds a public dashboard. Every cycle = request tx +
   fulfill tx + callback tx — ~72+ on-chain txs/day *generated by the product
   itself*, visible on the explorer, and the screenshot that anchors the grant
   application and leaderboard listing.
2. **Agent wallet demo**: ERC-4337 smart account + paymaster → a chat UI where a
   user's agent calls the oracle gaslessly. Shows off their AA stack, gives the
   Foundation a second flagship story, and every interaction is oracle revenue.
3. **`oracle-consumer-starter`** (open-source template): minimal consumer
   contract + UI that any other BOT Chain project can clone in an afternoon.
   Every clone is a distribution channel — and every project that integrates
   has a self-interested reason to vote for us on the leaderboard.

---

## 6. Leaderboard & grant strategy

- **Listing**: submit via the official project form immediately after mainnet
  deploy (category: Infra / AI). The leaderboard rewards votes, not volume —
  our vote engine is the integrator network + Sentinel's users, not spam.
- **Vote mobilization**: points for verified integrators and dashboard users;
  reciprocal-support pacts with other listed projects (standard practice in
  these programs; the 60-min/wallet rule means sustained community > bursts).
  Monthly math: 101 votes is trivially reachable; 1,001 needs the starter-kit
  integrator network; 10,001 needs a real ecosystem — treat it as a stretch
  metric, not a plan.
- **Grant positioning** (the real prize): apply to the ecosystem fund framed as
  *"the first working AI compute layer on BOT Chain — the vCompute/MPL item
  from your own roadmap, delivered as deployed, documented, revenue-taking
  software."* Evidence package: verified contracts, dashboard, docs site,
  Sentinel's continuous tx feed, gateway revenue.
- **Compliance**: no sybil voting, no incentivized vote-buying we can't
  defend — the rules reserve disqualification rights and vagueness cuts both
  ways.

---

## 7. Build phases

**Phase 0 — Spike (gate: do not build past this on assumptions)**

User decision: **testnet-only now**; the mainnet legs move to a hard gate in
Phase 3 (marked `MAINNET-GATE`) — before deploy, not after.

- [x] Contract deploy to testnet 968 — SpikePing @ `0x1C8695E71faB85fFdd4C0c5ac588Ef6a3EFF5B62`,
  deploy tx `0xabf255d4…d66ffa` (block ~24.79M), 183,335 gas / 0.003667 tBOT
- [x] Event pipeline verified — `ping` tx `0x54833131…55df09` (46,431 gas),
  `Pinged` event retrieved via `eth_getLogs` (block 24792052, seq=1)
- [x] WSS — confirmed: **no public WS on either net** (all handshakes fail);
  getLogs-poll is the primary, block-poll the fallback
- [x] Testnet BDEX contracts respond — V2 factory `0x65b8…15a3` live (404 pairs),
  WBOT/USDT pair `0xD3EC…94Fa` holds reserves; mainnet V2 factory live (29 pairs)
- [x] Gas measured — 20 gwei flat: deploy 183k ≈ 0.0037 tBOT; write ~46k ≈ 0.0009.
  Oracle fulfill est. 80–150k gas ≈ **$0.02–0.05/tx at BOT≈$12** → fee floor
  ≥$0.10/query (small tier) keeps ≥50% margin over on-chain cost alone
- [ ] `MAINNET-GATE` (Phase 3, before deploy): contract deploy on 677, WSS on
  mainnet RPC, USDT bridge in AND out, WBOT swap on BDEX — small real funds
- [ ] Leaderboard listing eligibility confirmed in writing via official channel

**Deployments log** (per chain-skill convention — network / address / tx):
| Contract | Network | Address | Deploy tx |
|---|---|---|---|
| SpikePing | testnet-968 | `0x1C8695E71faB85fFdd4C0c5ac588Ef6a3EFF5B62` | `0xabf255d45a3c7d58cc2727afcbfd56bb6fd6ac895a86ae1084fc213bd4d66ffa` |
| ModelRegistry | testnet-968 | `0x8f487264E1B183F588CAc678D000754D3bd9B07E` | `0xbd1b38dab9805af563aa56389d454c29d19a8a47fa5a7a6bbcb98f639bd0e90f` |
| OperatorRegistry | testnet-968 | `0x824271cc9f2A1556e4ecB6287830f200F92DB9Da` | `0xe7a013445a79cfca774f3920641d6c8ee3bb382c40cb684d78c96cda6c574875` |
| OracleCoordinator | testnet-968 | `0x7F7e5256cA568B981e1a09642d8F756D9c89F706` | `0x56c01f382c6ec5836e64c28ff977f875d0d03bb694b7adf4ba279214acaf4fa6` |
| Sentinel (echo:v1, 5min) | testnet-968 | `0x0245cc872b5F51197dDE6E0dc3b7A21a3c55F787` | forge broadcast run |

**v2 stack (2026-09-27) — redeployed after audit fixes** (registry
re-registration reset, Sentinel monotonic report guard); all four contracts
verified on scan.bohr.life. The v1 contracts above are superseded and idle
(v1 Sentinel still holds ~0.47 tBOT — no withdraw path by design).
|| ModelRegistry v2 | testnet-968 | `0xb208fb3016c14b0946bf3FBbe1Def28d72F63193` | Deploy.s.sol broadcast |
|| OperatorRegistry v2 | testnet-968 | `0xf22dA276EAA3c4de433115a95111907A6338D3A5` | Deploy.s.sol broadcast |
|| OracleCoordinator v2 | testnet-968 | `0x4861Ff97A82436d64514C0B119c4796F46a4d8Da` | Deploy.s.sol broadcast |
|| Sentinel v2 (sentinel:v1, 5min) | testnet-968 | `0x1ea8e8429Ecae0Dfa8dEbb93983DDe93EA31a014` | forge broadcast run |
| operator registration | testnet-968 | burner `0xb8a5…Dd03` | `0x5bd2e87ef916002f24603cad6d4f6d84a0d65f05127547128bfa34007bca5e4b` |

**Model registrations (testnet):** `echo:v1` `0x3910a127…` and
`openai:gpt-4o-mini` `0x23b8fc05…` from Deploy.s.sol; `sentinel:v1`
`0x2c9a7f15bb5bf1e2d68e4e3ceeb634b14036037af1bbcd69e8ba93b054fbc2fc` via
`setModel` tx `0x684a9b12…` → `Sentinel.setQuery` tx `0x429c89fe…` (price
0.001 BOT). Sentinel now requests the data-bearing intel model.

**Phase 1 evidence (testnet, 2026-09-26):** operator registered (0.5 tBOT
stake, tx `0xe66f1139…`); request #1 `0xf233be0f…` → node picked up
`RequestSent` via getLogs-poll → echo inference → `fulfill` tx
`0x990219deccc2c0e4ac4a3c86d0f7788b5ec15ca7e39bc587de9e34bd459659ec`;
on-chain: status Fulfilled, operator paid 0.0009, protocol accrued 0.0001
(10% cut verified). Bugs caught by exercising, not reasoning: topics[2] is
requester not modelId; restarts needed a lookback rescan.

**Sentinel evidence (testnet):** funded 0.5 tBOT (~500 queries); tick #2
`0xcdf31181516e9dc83e9a349592786dbcb74a3df51d47efb82363ffe35322112f` →
request #3 → fulfill `0x93854d35…` → **callback landed** — `latestReport`
reads `echo:Summarize the state of the BOT Chain ecosystem…[tick 1]`.
Callback round-trip verified on-chain including the reverting-callback edge
(CallbackResult=false on oversized outputs → node now caps output at 2KB and
normalizes hex-string inputs to bytes — both found by exercising).

**sentinel:v1 evidence (testnet, 2026-09-27):** request #25 fulfilled
(`0x54e1695f…`) with a real-data report — `latestReport` reads live block,
gas, BDEX WBOT/USDT reserves (519.7 WBOT / 0 USDT), oracle stats. Backend:
`node/src/backends.js` `sentinel:` — builds the snapshot via RPC, calls the
configured OpenAI-compatible LLM when `OPENAI_API_KEY` is set, else emits a
labeled deterministic report (no fake inference). Node runs detached via
`node --env-file=.env.testnet src/index.js` (env gitignored).

**Live LLM inference (testnet, 2026-09-27):** Qwen `qwen3.8-max` via the
Bitget hackathon OpenAI-compatible endpoint (`hackathon.bitgetops.com/v1`;
key in `node/.env.testnet`, never committed). Request #28 fulfill tx
`0x48dff9d7…` — `latestReport` is a model-written brief over the live
snapshot (BDEX one-sided pool, gas, oracle stats). Report prefix
`[sentinel:qwen3.8-max]` makes the serving model auditable on-chain.

**Phase 1 — Core protocol (testnet)**
Coordinator + registry + model registry + consumer interface; oracle-node with
WSS + poll paths; one local model + one passthrough; Foundry/Hardhat tests
covering request→fulfill→callback, timeout refund, challenge bond.

**Phase 2 — Product surface**
Gateway API + key billing, SDK, dashboard, docs site, Sentinel v1 on testnet.

**Phase 3 — Mainnet + listing**
Deploy + verify contracts on scan.botchain.ai, Sentinel live, directory
submission, leaderboard registration, launch notes.

**Phase 4 — Decentralize + grant package**
Second operator (ourselves on separate infra at minimum), challenge/slashing
exercised on testnet, TEE/opML doc, grant application with evidence.

Every phase ends only when its checklist passes against the *deployed* system —
same discipline as the hackathon contract: performed, observed, reported.

---

## 8. Repo layout

```
bot-oracle/
  SPEC.md                  <- this file (working doc, at project root)
  contracts/               <- coordinator, registry, model registry, interfaces
  node/                    <- oracle-node (TS): listener, backends, fulfiller
  gateway/                 <- HTTP API + billing
  app/                     <- Next.js dashboard + docs site
  packages/sdk/            <- @bot-oracle/sdk
  starter/                 <- oracle-consumer-starter (clonable template)
```

Single repo, MIT license, lockfile committed — same conventions as `creditpass`.

---

## 9. Risks, stated plainly

- **The chain may be quieter than its marketing.** If Phase 0 shows the bridge
  or DEX is non-functional in practice, stop — no build is justified on a chain
  you can't move value through.
- **Fee revenue is unproven.** Near-term revenue is gateway API fees and
  whatever the grant application yields; on-chain query fees need consumers,
  and there are none yet that aren't ours.
- **"Abnormal votes" is undefined.** Points-for-votes programs sit in a gray
  zone; keep incentives tied to *usage* (integrators, dashboard accounts) and
  documented.
- **RPC fragility.** A disabled `eth_getLogs` plus one public endpoint is a
  single point of failure; the own-node option may become a hard requirement —
  ~500GB+ SSD, real infra cost.
- **BOT liquidity is thinner than "thin": ~$6k of real DEX depth.** Probed
  2026-09-26: the flagship WBOT/USDT pool holds $3,019 USDT against 244.7
  WBOT. Any BOT earned is nearly unrealizable at size; on-chain BOT/USDT price
  feeds can't be trusted for fee conversion at volume — keep the admin-set
  rate and USDT-denominated pricing exactly as designed.
- **Single-exchange BOT liquidity.** Any BOT earned is hard to realize at size;
  prefer USDT pricing for anything that matters.

## 10. Decisions log

- **Inference backend**: passthrough-first — v1 proxies hosted LLM APIs; local
  models deferred to a later tier.
- **Billing**: crypto-only at launch (USDT deposits + API keys); no fiat.
- **Phase 0**: testnet-only; mainnet verification is a Phase 3 hard gate.
- **v1 fees**: native BOT only; USDT arrives via prepaid subscription vault in
  Phase 2 (keeps `request()` signature stable).
- **Toolchain**: Foundry v1.8.x (`forge`/`cast`); deps `forge-std@1.16.2`,
  `openzeppelin-contracts@5.7.0` via `forge install --no-git` (flat repo,
  versions pinned here).
- **Slasher role**: OperatorRegistry.slash is callable by owner OR the
  coordinator's registered `slasher` — slashing power lives inside the
  dispute-resolution path, not an EOA.
- **Gateway billing v1**: API keys issued by admin after USDT payment
  (manual reconciliation); quotas enforced + metered per key. Automated
  on-chain credit top-up is a later phase.
- **Dashboard**: server-rendered Next.js 16 (`force-dynamic`), read-only
  JSON-RPC — no wallet needed; every stat verifiable on-chain.
- **Open**: product name ("bot-oracle" is a placeholder).
