import Link from "next/link";
import { NET } from "@/lib/chain";
import CopyCommand from "../CopyCommand";

export const metadata = {
  title: "bot-oracle whitepaper",
  description:
    "BOT Oracle whitepaper: a paid AI inference oracle for BOT Chain. Architecture, trust model, fees, deployments.",
};

const EXPLORER = NET.explorer;
const CHAIN_ID = NET.chainId;

const a = (href: string, text: string) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="text-secondary underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
  >
    {text}
  </a>
);

const H2 = ({ id, n, children }: { id: string; n: string; children: React.ReactNode }) => (
  <h2 id={id} className="scroll-mt-8 text-base font-medium text-foreground pt-8 mt-8 border-t border-border first:border-t-0 first:pt-0 first:mt-0">
    <span className="text-steel">{n}.</span> {children}
  </h2>
);

const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-sm font-medium text-secondary mt-6 mb-2">{children}</h3>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-secondary leading-relaxed mt-3">{children}</p>
);

const Addr = ({ name, addr }: { name: string; addr: string }) => (
  <tr className="border-t border-border align-top">
    <td className="px-4 py-2 text-secondary">{name}</td>
    <td className="px-4 py-2 font-mono text-xs">
      <a
        href={`${EXPLORER}/address/${addr}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-secondary underline decoration-dotted underline-offset-2 hover:text-foreground break-all focus-visible:outline-2 focus-visible:outline-primary"
      >
        {addr}
      </a>
    </td>
  </tr>
);

const TOC = [
  ["abstract", "1", "Abstract"],
  ["problem", "2", "Problem"],
  ["design", "3", "Protocol design"],
  ["contracts", "4", "On-chain contracts"],
  ["offchain", "5", "Off-chain components"],
  ["delivery", "6", "Event delivery"],
  ["trust", "7", "Trust model"],
  ["fees", "8", "Fees and monetization"],
  ["demand", "9", "Demand bootstrap: Sentinel"],
  ["limits", "10", "Limitations and risks"],
  ["roadmap", "11", "Roadmap"],
  ["deployments", "12", "Deployments"],
  ["integrate", "13", "Integration"],
] as const;

export default function Whitepaper() {
  return (
    <main className="whitepaper-root min-h-screen bg-surface text-foreground font-sans">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <nav aria-label="breadcrumb" className="mb-8 print:hidden">
          <Link
            href="/"
            className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-secondary focus-visible:outline-2 focus-visible:outline-primary"
          >
            ← live dashboard
          </Link>
        </nav>

        <header className="mb-10">
          <div className="flex items-center gap-2.5 mb-3">
            <svg width="32" height="32" viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
              <rect width="48" height="48" rx="2" fill="#0a0a0a" />
              <rect width="48" height="48" rx="2" fill="none" stroke="#3a3a3a" strokeWidth="1.5" />
              <rect x="3" y="8" width="2" height="32" fill="#da5c2c" />
              <path d="M15 15.5 L23.5 24 L15 32.5" fill="none" stroke="#eeeeee" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="27" y1="32.5" x2="38" y2="32.5" stroke="#eeeeee" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <h1 className="text-2xl font-semibold text-foreground">bot-oracle</h1>
          </div>
          <p className="text-sm text-secondary">
            A paid AI inference oracle for BOT Chain
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Whitepaper v0.1 · September 2026 · status: live on {NET.name} (chainId {CHAIN_ID}) ·{" "}
            <a
              href="https://github.com/DruxAMB/bot-oracle/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted underline-offset-2 hover:text-secondary focus-visible:outline-2 focus-visible:outline-primary"
            >
              MIT license
            </a>{" "}
            · <span className="print:hidden">print to PDF for offline reading</span>
          </p>
        </header>

        <div className="grid lg:grid-cols-[220px_minmax(0,1fr)] gap-8">
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <nav aria-label="Table of contents" className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground mb-2">Contents</p>
              <ol className="space-y-1.5">
                {TOC.map(([id, n, label]) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      className="text-xs text-secondary underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <span className="text-steel">{n}.</span> {label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          <article className="min-w-0">
            <H2 id="abstract" n="1">Abstract</H2>
            <P>
              BOT Oracle is an AI inference oracle deployed on BOT Chain. A consumer contract or wallet
              submits a paid request naming a model and an input; a staked off-chain operator runs the
              inference; the result and its output hash are written back on-chain, atomically invoking a
              consumer callback when one is set. The protocol escrows each fee, pays the operator at
              fulfillment, and retains a 10% protocol cut. On testnet the system has served hundreds of
              requests end to end, including a first-party autonomous consumer, Sentinel, that pays for a
              market-intelligence report every few minutes. The oracle turns "AI on-chain" from a roadmap
              item into a billable, verifiable service.
            </P>

            <H2 id="problem" n="2">Problem</H2>
            <P>
              Smart contracts cannot call language models. Any application that wants summarization,
              classification, or generation must bridge off-chain compute to on-chain state, and today
              BOT Chain has no oracle infrastructure to do it: no Chainlink, no OAO, no inference
              router. Every project would otherwise build and operate this layer alone.
            </P>
            <P>
              The whitepaper for BOT Chain names AI agents and oracle services as core ecosystem
              components. BOT Oracle delivers that component as running software rather than a plan:
              deployed contracts, a working operator, a paying consumer, and a public dashboard.
            </P>

            <H2 id="design" n="3">Protocol design</H2>
            <P>Four actors: the consumer contract, the coordinator, the operator, and the model registry.</P>
            <pre className="mt-3 overflow-x-auto rounded bg-card border border-border p-4 text-xs text-secondary leading-relaxed">{`consumer ── request(modelId, input, fee) ──▶ OracleCoordinator
                                                │ emits RequestSent
                                                ▼
                                   off-chain operator listens, runs inference
                                                │ fulfill(requestId, output)
                                                ▼
consumer ◀── callback(result) ── escrow pays operator (fee − 10% protocol cut)`}</pre>
            <P>
              A request escrows its fee at submission. The operator fulfills within a deadline or the
              fee refunds via <code className="text-steel">refundIfTimedOut</code>. Fulfillment stores the
              output hash and payload on-chain and calls{" "}
              <code className="text-steel">callbackContract.onOracleResult(requestId, output)</code> in
              the same transaction, so consumers read results atomically.
            </P>

            <H2 id="contracts" n="4">On-chain contracts</H2>
            <P>
              Four contracts, all source-verified on the explorer. Consumers integrate one interface
              (<code className="text-steel">IOracleConsumer</code>) and call a single payable method.
            </P>
            <pre className="mt-3 overflow-x-auto rounded bg-card border border-border p-4 text-xs text-secondary leading-relaxed">{`function request(bytes32 modelId, bytes input,
    address callbackContract, uint64 callbackGasLimit)
    external payable returns (uint256 requestId);

function fulfill(uint256 requestId, bytes output,
    bytes32 inputHash, bytes nodeSig) external onlyOperator;

function refundIfTimedOut(uint256 requestId) external;
function challenge(uint256 requestId) external payable;`}</pre>
            <div className="mt-3 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-elevated text-muted-foreground text-xs">
                  <tr>
                    <th scope="col" className="text-left px-4 py-2 font-normal">Contract</th>
                    <th scope="col" className="text-left px-4 py-2 font-normal">Role</th>
                  </tr>
                </thead>
                <tbody className="text-secondary">
                  <tr className="border-t border-border"><td className="px-4 py-2">OracleCoordinator</td><td className="px-4 py-2">Fee escrow, request/fulfill lifecycle, callbacks, disputes</td></tr>
                  <tr className="border-t border-border"><td className="px-4 py-2">ModelRegistry</td><td className="px-4 py-2">modelId → price, backend, container hash, active flag</td></tr>
                  <tr className="border-t border-border"><td className="px-4 py-2">OperatorRegistry</td><td className="px-4 py-2">Operator stake, status, stats; enforces minimum stake</td></tr>
                  <tr className="border-t border-border"><td className="px-4 py-2">Sentinel</td><td className="px-4 py-2">First-party consumer; schedules paid requests, stores reports</td></tr>
                </tbody>
              </table>
            </div>

            <H2 id="offchain" n="5">Off-chain components</H2>
            <H3>oracle-node</H3>
            <P>
              Polls for <code className="text-steel">RequestSent</code> events, routes inputs to model
              backends, signs results, and calls <code className="text-steel">fulfill</code>. Restart-safe:
              on boot it rescans from its last processed block, so a crash loses no requests. Backends are
              pluggable: <code className="text-steel">echo:</code> for integration testing,{" "}
              <code className="text-steel">sentinel:</code> for the data-bearing report pipeline, and an
              OpenAI-protocol backend (<code className="text-steel">LLM_*</code> env config) currently
              serving Qwen.
            </P>
            <H3>gateway</H3>
            <P>
              An HTTP API (<code className="text-steel">POST /v1/query</code>) that wraps the on-chain
              round trip for users who want inference without writing a contract. Metered by API key;
              every response still anchors on-chain.
            </P>
            <H3>@bot-oracle/sdk</H3>
            <P>
              A small JavaScript client: <code className="text-steel">request()</code>,{" "}
              <code className="text-steel">awaitResult()</code>, <code className="text-steel">getResult()</code>,{" "}
              <code className="text-steel">verifyResult()</code> (recomputes the output hash against
              chain state). Proven end to end on testnet; installable as a repo tarball today, npm
              registry publish pending.
            </P>
            <H3>dashboard</H3>
            <P>
              Server-rendered network view at {a("https://bot-oracle.druxamb.dev", "bot-oracle.druxamb.dev")}:
              live request feed, fees accrued, operator stats, and the latest Sentinel report.
            </P>

            <H2 id="delivery" n="6">Event delivery</H2>
            <P>
              Probed against live RPCs rather than assumed from docs: no public WebSocket endpoint exists
              on either network, while <code className="text-steel">eth_getLogs</code> works on both
              despite documentation claiming otherwise. The node therefore uses getLogs polling as the
              primary path with a block-receipt fallback, and the project can run its own node (BOT Chain
              publishes deploy scripts) if public endpoints degrade.
            </P>

            <H2 id="trust" n="7">Trust model</H2>
            <P>
              v1 is honest about its assumption: a single staked operator, slashable on proven fraud,
              pinned to a published model hash, with a posted-bond challenge path forcing re-execution.
              The decentralization ladder is designed so the verification layer can deepen without
              breaking consumers.
            </P>
            <div className="mt-3 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-elevated text-muted-foreground text-xs">
                  <tr>
                    <th scope="col" className="text-left px-4 py-2 font-normal">Phase</th>
                    <th scope="col" className="text-left px-4 py-2 font-normal">Model</th>
                    <th scope="col" className="text-left px-4 py-2 font-normal">Guarantee</th>
                  </tr>
                </thead>
                <tbody className="text-secondary">
                  <tr className="border-t border-border"><td className="px-4 py-2">v1 (now)</td><td className="px-4 py-2">Single staked operator + challenge bond</td><td className="px-4 py-2">Staked, slashable, replayable</td></tr>
                  <tr className="border-t border-border"><td className="px-4 py-2">v2</td><td className="px-4 py-2">N-of-M operators, threshold agreement</td><td className="px-4 py-2">Byzantine tolerance for single faults</td></tr>
                  <tr className="border-t border-border"><td className="px-4 py-2">v3</td><td className="px-4 py-2">TEE attestation / opML fraud proofs</td><td className="px-4 py-2">Verifiable inference</td></tr>
                </tbody>
              </table>
            </div>

            <H2 id="fees" n="8">Fees and monetization</H2>
            <P>
              Every request is paid. The coordinator escrows the fee, releases 90% to the operator at
              fulfillment, and accrues 10% as protocol revenue; the split is verified on-chain, not just
              documented. Pricing is per-model (mainnet: 0.01-0.05 BOT per query by tier), with
              USDT-denominated pricing and prepaid balances planned for high-frequency consumers.
              Off-chain revenue comes through the metered gateway; B2B dedicated operator slots are a
              later phase.
            </P>

            <H2 id="demand" n="9">Demand bootstrap: Sentinel</H2>
            <P>
              An oracle with no consumers is a demo. Sentinel is the first-party consumer that makes this
              a business: an autonomous contract that pays for a market-intelligence report on a fixed
              interval, runs it through the real LLM backend, and stores the result on-chain where the
              dashboard renders it. Every tick is a request transaction, a fulfill transaction, and a
              callback, generated by the product itself and auditable on the explorer. 250+ ticks and
              counting on testnet.
            </P>

            <H2 id="limits" n="10">Limitations and risks</H2>
            <ul className="mt-3 space-y-2 text-sm text-secondary leading-relaxed list-none">
              <li className="border-l-2 border-border pl-3"><span className="text-foreground">Single operator.</span> v1 trusts one staked operator. Challenge bonds and deterministic replay bound the risk; multi-operator is the next phase.</li>
              <li className="border-l-2 border-border pl-3"><span className="text-foreground">Operator infrastructure.</span> Node and gateway currently run on a single machine with a self-healing watchdog; durable VPS hosting is planned and gated on ecosystem funding.</li>
              <li className="border-l-2 border-border pl-3"><span className="text-foreground">RPC fragility.</span> One public endpoint is a single point of failure; running a dedicated node remains the fallback.</li>
              <li className="border-l-2 border-border pl-3"><span className="text-foreground">Thin BOT liquidity.</span> On-chain price feeds are unreliable at size (~$6k real DEX depth when probed), so pricing uses admin-set and USDT-denominated rates rather than spot conversion.</li>
              <li className="border-l-2 border-border pl-3"><span className="text-foreground">Revenue horizon.</span> On-chain query fees need external consumers; until they exist, Sentinel demonstrates demand and the gateway provides the nearer revenue path.</li>
            </ul>

            <H2 id="roadmap" n="11">Roadmap</H2>
            <div className="mt-3 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-elevated text-muted-foreground text-xs">
                  <tr>
                    <th scope="col" className="text-left px-4 py-2 font-normal">Phase</th>
                    <th scope="col" className="text-left px-4 py-2 font-normal">Deliverable</th>
                  </tr>
                </thead>
                <tbody className="text-secondary">
                  <tr className="border-t border-border"><td className="px-4 py-2">Done</td><td className="px-4 py-2">Testnet protocol, operator, gateway, SDK, Sentinel, live dashboard</td></tr>
                  <tr className="border-t border-border"><td className="px-4 py-2">Soon</td><td className="px-4 py-2">VPS for node + gateway with public endpoint (gated on ecosystem funding, no fixed date); npm registry publish</td></tr>
                  <tr className="border-t border-border"><td className="px-4 py-2">Next</td><td className="px-4 py-2">Second operator on separate infra; challenge and slashing exercised on testnet</td></tr>
                  <tr className="border-t border-border"><td className="px-4 py-2">Later</td><td className="px-4 py-2">Mainnet deployment after audit; TEE/opML verifiable inference; consumer prepaid vaults</td></tr>
                </tbody>
              </table>
            </div>

            <H2 id="deployments" n="12">Deployments</H2>
            <P>
              {NET.name}, chainId {CHAIN_ID}. All contracts source-verified on the explorer.
            </P>
            <div className="mt-3 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-elevated text-muted-foreground text-xs">
                  <tr>
                    <th scope="col" className="text-left px-4 py-2 font-normal">Contract</th>
                    <th scope="col" className="text-left px-4 py-2 font-normal">Address</th>
                  </tr>
                </thead>
                <tbody>
                  <Addr name="OracleCoordinator" addr={NET.coordinator} />
                  <Addr name="ModelRegistry" addr={NET.models} />
                  <Addr name="OperatorRegistry" addr={NET.registry} />
                  <Addr name="Sentinel (consumer)" addr={NET.sentinel} />
                  <Addr name="OracleCoordinator v1 (superseded)" addr={NET.legacyCoordinator} />
                </tbody>
              </table>
            </div>

            <H2 id="integrate" n="13">Integration</H2>
            <P>Contracts implement <code className="text-steel">IOracleConsumer</code> and call{" "}
            <code className="text-steel">request()</code> with payment. Scripts use the SDK:</P>
            <div className="mt-3">
              <CopyCommand cmd="npm i https://raw.githubusercontent.com/DruxAMB/bot-oracle/main/dist/bot-oracle-sdk-0.1.1.tgz" />
            </div>
            <pre className="mt-3 overflow-x-auto rounded bg-card border border-border p-4 text-xs text-secondary leading-relaxed">{`import { OracleClient } from "@bot-oracle/sdk";
const o = new OracleClient({ rpcUrl, chainId: ${CHAIN_ID}, coordinator, models, signer });
const value = await o.priceOf(OracleClient.modelId("echo:v1"));
const { requestId } = await o.request({ modelId: OracleClient.modelId("echo:v1"), prompt: "hello", value });
await o.awaitResult(requestId);
const text = await o.getResult(requestId);`}</pre>
            <P>
              Self-hosted HTTP gateway: clone the repo, run <code className="text-steel">gateway/</code>,
              then <code className="text-steel">POST /v1/query</code> with an issued API key. Source,
              spec, and smoke tests: {a("https://github.com/DruxAMB/bot-oracle", "github.com/DruxAMB/bot-oracle")}.
            </P>
          </article>
        </div>

        <footer className="mt-12 border-t border-border pt-6 text-xs text-steel">
          BOT Oracle · {NET.name} · {a("https://github.com/DruxAMB/bot-oracle", "source")} ·{" "}
          <Link href="/" className="underline decoration-dotted underline-offset-2 hover:text-secondary focus-visible:outline-2 focus-visible:outline-primary">
            live dashboard
          </Link>
          <div className="mt-2">
            Built on {a("https://botchain.ai", "BOT Chain ↗")} · {a("https://scan.botchain.ai", "mainnet explorer ↗")} · {a("https://x.com/botoracle_", "@botoracle_ ↗")}
          </div>
        </footer>
      </div>
    </main>
  );
}
