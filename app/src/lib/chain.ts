import { JsonRpcProvider, Contract, AbiCoder, formatEther } from "ethers";

export const NET = {
  name: process.env.NEXT_PUBLIC_NET_NAME ?? "BOT Chain Testnet",
  rpc: process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.bohr.life",
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "968"),
  explorer: process.env.NEXT_PUBLIC_EXPLORER ?? "https://scan.bohr.life",
  coordinator: process.env.NEXT_PUBLIC_COORDINATOR ?? "0x4861Ff97A82436d64514C0B119c4796F46a4d8Da",
  models: process.env.NEXT_PUBLIC_MODELS ?? "0xb208fb3016c14b0946bf3FBbe1Def28d72F63193",
  registry: process.env.NEXT_PUBLIC_REGISTRY ?? "0xf22dA276EAA3c4de433115a95111907A6338D3A5",
  sentinel: process.env.NEXT_PUBLIC_SENTINEL ?? "0x1ea8e8429Ecae0Dfa8dEbb93983DDe93EA31a014",
  // Superseded v1 coordinator — read so the stats reflect total history,
  // not just the current deployment.
  legacyCoordinator: process.env.NEXT_PUBLIC_LEGACY_COORDINATOR ?? "0x7F7e5256cA568B981e1a09642d8F756D9c89F706",
};

const COORD_ABI = [
  "function nextRequestId() view returns (uint256)",
  "function accruedProtocolFees() view returns (uint256)",
  "function requests(uint256) view returns (address requester, bytes32 modelId, bytes32 inputHash, uint256 fee, address callbackContract, uint64 callbackGasLimit, uint64 createdAt, uint64 fulfilledAt, uint8 status, bytes32 outputHash, address operator, address challenger)",
  "event RequestSent(uint256 indexed requestId, address indexed requester, bytes32 indexed modelId, bytes32 inputHash, bytes input, address callbackContract)",
  "event RequestFulfilled(uint256 indexed requestId, address indexed operator, bytes32 outputHash, bytes output)",
];
const REG_ABI = [
  "function operatorCount() view returns (uint256)",
  "function minStake() view returns (uint256)",
  "function operatorList(uint256) view returns (address)",
  "function operators(address) view returns (uint256 stake, uint256 unstakeRequestedAt, string nodeEndpoint)",
  "function isActiveOperator(address) view returns (bool)",
];
const MODELS_ABI = [
  "event ModelSet(bytes32 indexed modelId, uint256 priceWei, bytes32 containerHash, string backend, bool active)",
];
const SENT_ABI = [
  "function latestReport() view returns (string)",
  "function latestReportAt() view returns (uint64)",
  "function tickIndex() view returns (uint256)",
  "function modelId() view returns (bytes32)",
  "function minInterval() view returns (uint64)",
  "function lastTickAt() view returns (uint64)",
];

const STATUS = ["Pending", "Fulfilled", "Refunded", "Disputed", "Resolved"] as const;
const abi = AbiCoder.defaultAbiCoder();

export type RequestRow = {
  id: bigint;
  requester: string;
  modelId: string;
  fee: string;
  status: string;
  ageSec: number;
  operator: string | null;
  txHash: string;
  result: string | null;
};

export type ModelRow = {
  modelId: string;
  priceWei: bigint;
  backend: string;
  active: boolean;
};

export type OperatorRow = {
  address: string;
  stake: bigint;
  endpoint: string;
  active: boolean;
};

export type DashData = {
  block: number;
  totalRequests: bigint;
  fulfilled: number;
  feesWei: bigint;
  operatorCount: bigint;
  minStake: bigint;
  models: ModelRow[];
  operators: OperatorRow[];
  sentinelTicks: bigint;
  sentinelReport: string;
  sentinelReportAt: number;
  sentinelBalance: bigint;
  sentinelMinInterval: number;
  sentinelLastTickAt: number;
  requests: RequestRow[];
  legacyRequests: bigint;
  legacyFulfilled: number;
  legacyFeesWei: bigint;
  offline?: string;
};

const EMPTY: DashData = {
  block: 0, totalRequests: 0n, fulfilled: 0, feesWei: 0n, operatorCount: 0n,
  minStake: 0n, models: [], operators: [], sentinelTicks: 0n, sentinelReport: "",
  sentinelReportAt: 0, sentinelBalance: 0n, sentinelMinInterval: 0, sentinelLastTickAt: 0,
  requests: [], legacyRequests: 0n, legacyFulfilled: 0, legacyFeesWei: 0n,
};

export async function loadDash(): Promise<DashData> {
  try {
    // staticNetwork: chainId is hardcoded — skips ethers' startup
    // detect call (one fewer RPC round-trip per cold SSR render).
    const p = new JsonRpcProvider(NET.rpc, NET.chainId, { staticNetwork: true });
    const coord = new Contract(NET.coordinator, COORD_ABI, p);
    const reg = new Contract(NET.registry, REG_ABI, p);
    const sent = new Contract(NET.sentinel, SENT_ABI, p);
    const modelReg = new Contract(NET.models, MODELS_ABI, p);
    const legacyCoord = new Contract(NET.legacyCoordinator, COORD_ABI, p);

    const [block, nextId, fees, ops, stake, ticks, report, reportAt, sentBal, sentInterval, sentLastTick] =
      await Promise.all([
        p.getBlockNumber(),
        coord.nextRequestId(),
        coord.accruedProtocolFees(),
        reg.operatorCount(),
        reg.minStake(),
        sent.tickIndex(),
        sent.latestReport().catch(() => ""),
        sent.latestReportAt().catch(() => 0n),
        p.getBalance(NET.sentinel).catch(() => 0n),
        sent.minInterval().catch(() => 0n),
        sent.lastTickAt().catch(() => 0n),
      ]);

    // legacy v1 coordinator — its own counter/fees, additive to the totals
    const [legacyNext, legacyFees] = await Promise.all([
      legacyCoord.nextRequestId().catch(() => 1n),
      legacyCoord.accruedProtocolFees().catch(() => 0n),
    ]);
    const legacyTotal = legacyNext - 1n;
    const legacyFulfilled = await Promise.all(
      Array.from({ length: Math.min(Number(legacyTotal), 500) }, (_, i) =>
        legacyCoord.requests(i + 1).then((r) => Number(r.status))
      )
    ).then((ss) => ss.filter((s) => s === 1 || s === 4).length);

    const from = Math.max(0, block - 50_000);
    const [sentLogs, fulfilledLogs, modelLogs] = await Promise.all([
      p.getLogs({ address: NET.coordinator, topics: [coord.interface.getEvent("RequestSent")!.topicHash], fromBlock: from, toBlock: "latest" }),
      p.getLogs({ address: NET.coordinator, topics: [coord.interface.getEvent("RequestFulfilled")!.topicHash], fromBlock: from, toBlock: "latest" }),
      p.getLogs({ address: NET.models, topics: [modelReg.interface.getEvent("ModelSet")!.topicHash], fromBlock: 0, toBlock: "latest" }),
    ]);

    // requestId -> decoded output string (from RequestFulfilled payload)
    const results = new Map<string, string>();
    for (const l of fulfilledLogs) {
      try {
        const [, output] = abi.decode(["bytes32", "bytes"], l.data);
        const [text] = abi.decode(["string"], output);
        results.set(BigInt(l.topics[1]).toString(), text);
      } catch {}
    }

    // models: last ModelSet per modelId wins (updates in place)
    const modelMap = new Map<string, ModelRow>();
    for (const l of modelLogs) {
      try {
        const [priceWei, , backend, active] = abi.decode(["uint256", "bytes32", "string", "bool"], l.data);
        modelMap.set(l.topics[1], { modelId: l.topics[1], priceWei, backend, active });
      } catch {}
    }

    const opList: OperatorRow[] = await Promise.all(
      Array.from({ length: Number(ops) }, async (_, i) => {
        const addr = await reg.operatorList(i);
        const [o, active] = await Promise.all([reg.operators(addr), reg.isActiveOperator(addr)]);
        return { address: addr, stake: o.stake, endpoint: o.nodeEndpoint, active };
      })
    );

    const recent = sentLogs.slice(-15).reverse();
    const now = Math.floor(Date.now() / 1000);
    const rows: RequestRow[] = await Promise.all(
      recent.map(async (l) => {
        const id = BigInt(l.topics[1]);
        const r = await coord.requests(id);
        return {
          id,
          requester: "0x" + l.topics[2].slice(26),
          modelId: l.topics[3],
          fee: formatEther(r.fee),
          status: STATUS[Number(r.status)] ?? "?",
          ageSec: Math.max(0, now - Number(r.createdAt)),
          operator: Number(r.status) === 1 ? r.operator : null,
          txHash: l.transactionHash,
          result: results.get(id.toString()) ?? null,
        };
      })
    );

    return {
      block,
      totalRequests: nextId - 1n,
      // exact count via enumeration — the log query is windowed
      fulfilled: await Promise.all(
        Array.from({ length: Math.min(Number(nextId - 1n), 500) }, (_, i) =>
          coord.requests(i + 1).then((r) => Number(r.status))
        )
      ).then((ss) => ss.filter((s) => s === 1 || s === 4).length),
      feesWei: fees,
      operatorCount: ops,
      minStake: stake,
      models: [...modelMap.values()],
      operators: opList,
      sentinelTicks: ticks,
      sentinelReport: report,
      sentinelReportAt: Number(reportAt),
      sentinelBalance: sentBal,
      sentinelMinInterval: Number(sentInterval),
      sentinelLastTickAt: Number(sentLastTick),
      requests: rows,
      legacyRequests: legacyTotal,
      legacyFulfilled,
      legacyFeesWei: legacyFees,
    };
  } catch (e) {
    return { ...EMPTY, offline: e instanceof Error ? e.message.slice(0, 160) : "rpc unreachable" };
  }
}
