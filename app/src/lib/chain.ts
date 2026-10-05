import { JsonRpcProvider, Contract, AbiCoder, formatEther } from "ethers";

export const NET = {
  name: process.env.NEXT_PUBLIC_NET_NAME ?? "BOT Chain",
  rpc: process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.botchain.ai",
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "677"),
  explorer: process.env.NEXT_PUBLIC_EXPLORER ?? "https://scan.botchain.ai",
  coordinator: process.env.NEXT_PUBLIC_COORDINATOR ?? "0x9A39fc7A9385F820CC9820E291519762DA0720a3",
  models: process.env.NEXT_PUBLIC_MODELS ?? "0x2e0b0D45DF4a9867e8E5F1e07d04076a5815CfCd",
  registry: process.env.NEXT_PUBLIC_REGISTRY ?? "0xfC059C84744843B1651bfa414D5500c0dF8Ca9D1",
  sentinel: process.env.NEXT_PUBLIC_SENTINEL ?? "0xBBDB7DE59E7eB67AFAF76FCcc32575A54166213E",
  // Superseded v1 coordinator - read so the stats reflect total history,
  // not just the current (UUPS proxy) deployment.
  legacyCoordinator: process.env.NEXT_PUBLIC_LEGACY_COORDINATOR ?? "0x8f487264E1B183F588CAc678D000754D3bd9B07E",
};

const COORD_ABI = [
  "function nextRequestId() view returns (uint256)",
  "function accruedProtocolFees() view returns (uint256)",
  "function requests(uint256) view returns (address requester, bytes32 modelId, bytes32 inputHash, uint256 fee, address callbackContract, uint64 callbackGasLimit, uint64 createdAt, uint64 fulfilledAt, uint8 status, bytes32 outputHash, address operator, address challenger)",
  "event RequestSent(uint256 indexed requestId, address indexed requester, bytes32 indexed modelId, bytes32 inputHash, bytes input, address callbackContract)",
  "event RequestFulfilled(uint256 indexed requestId, address indexed operator, bytes32 outputHash, bytes output)",
  "event RequestRefunded(uint256 indexed requestId, address indexed requester, uint256 fee)",
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
  "function queryPrice() view returns (uint256)",
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
  txHash: string | null;
  result: string | null;
  legacy?: boolean;
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
  sentinelQueryPrice: bigint;
  sentinelMinInterval: number;
  sentinelLastTickAt: number;
  requests: RequestRow[];
  legacyRequests: bigint;
  legacyFulfilled: number;
  legacyFeesWei: bigint;
  /** Distinct requester EOAs (real users) - contracts like Sentinel excluded. */
  uniquePayers: number;
  /** Distinct requester contracts (e.g. Sentinel) - disclosed separately. */
  contractConsumers: number;
  offline?: string;
};

const EMPTY: DashData = {
  block: 0, totalRequests: 0n, fulfilled: 0, feesWei: 0n, operatorCount: 0n,
  minStake: 0n, models: [], operators: [], sentinelTicks: 0n, sentinelReport: "",
  sentinelReportAt: 0, sentinelBalance: 0n, sentinelQueryPrice: 0n, sentinelMinInterval: 0, sentinelLastTickAt: 0,
  requests: [], legacyRequests: 0n, legacyFulfilled: 0, legacyFeesWei: 0n,
  uniquePayers: 0, contractConsumers: 0,
};

export async function loadDash(): Promise<DashData> {
  try {
    // staticNetwork: chainId is hardcoded - skips ethers' startup
    // detect call (one fewer RPC round-trip per cold SSR render).
    const p = new JsonRpcProvider(NET.rpc, NET.chainId, { staticNetwork: true });
    const coord = new Contract(NET.coordinator, COORD_ABI, p);
    const reg = new Contract(NET.registry, REG_ABI, p);
    const sent = new Contract(NET.sentinel, SENT_ABI, p);
    const modelReg = new Contract(NET.models, MODELS_ABI, p);
    const legacyCoord = new Contract(NET.legacyCoordinator, COORD_ABI, p);

    const [block, nextId, fees, ops, stake, ticks, report, reportAt, sentBal, sentInterval, sentLastTick, sentPrice] =
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
        sent.queryPrice().catch(() => 0n),
      ]);

    // legacy v1 coordinator - its own counter/fees, additive to the totals
    const [legacyNext, legacyFees] = await Promise.all([
      legacyCoord.nextRequestId().catch(() => 1n),
      legacyCoord.accruedProtocolFees().catch(() => 0n),
    ]);
    const legacyTotal = legacyNext - 1n;
    // A legacy decode failure must not take the whole dashboard down -
    // degrade to zero legacy contribution instead of the offline state.
    const legacyReqs = await Promise.all(
      Array.from({ length: Math.min(Number(legacyTotal), 500) }, (_, i) =>
        legacyCoord.requests(i + 1)
      )
    ).catch(() => [] as Awaited<ReturnType<typeof legacyCoord.requests>>[]);
    const legacyFulfilled = legacyReqs.filter(
      (r) => Number(r.status) === 1 || Number(r.status) === 4
    ).length;

    // Full-history event aggregation: one getLogs per topic from block 0.
    // Scales past the old 500-request enumeration cap - "Fulfilled" and payer
    // stats must stay accurate as request count grows.
    const [sentLogs, fulfilledLogs, refundLogs, modelLogs, legacySentLogs, legacyFulfilledLogs] = await Promise.all([
      p.getLogs({ address: NET.coordinator, topics: [coord.interface.getEvent("RequestSent")!.topicHash], fromBlock: 0, toBlock: "latest" }),
      p.getLogs({ address: NET.coordinator, topics: [coord.interface.getEvent("RequestFulfilled")!.topicHash], fromBlock: 0, toBlock: "latest" }),
      p.getLogs({ address: NET.coordinator, topics: [coord.interface.getEvent("RequestRefunded")!.topicHash], fromBlock: 0, toBlock: "latest" }),
      p.getLogs({ address: NET.models, topics: [modelReg.interface.getEvent("ModelSet")!.topicHash], fromBlock: 0, toBlock: "latest" }),
      // Legacy coordinator's own event history - powers the merged table rows.
      p.getLogs({ address: NET.legacyCoordinator, topics: [coord.interface.getEvent("RequestSent")!.topicHash], fromBlock: 0, toBlock: "latest" }).catch(() => [] as Awaited<ReturnType<typeof p.getLogs>>),
      p.getLogs({ address: NET.legacyCoordinator, topics: [coord.interface.getEvent("RequestFulfilled")!.topicHash], fromBlock: 0, toBlock: "latest" }).catch(() => [] as Awaited<ReturnType<typeof p.getLogs>>),
    ]);
    const refundedIds = new Set(refundLogs.map((l) => BigInt(l.topics[1]).toString()));

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

    // fulfilled = distinct requests that ever got a RequestFulfilled event.
    const fulfilledCount = new Set(fulfilledLogs.map((l) => BigInt(l.topics[1]).toString())).size;

    // Unique payers = requesters of requests that were NOT refunded - a user
    // who paid then got their money back isn't a paying user. Contract
    // requesters (Sentinel) are separated from EOAs via getCode.
    const requesters = new Set<string>();
    for (const l of sentLogs) {
      if (refundedIds.has(BigInt(l.topics[1]).toString())) continue;
      requesters.add(("0x" + l.topics[2].slice(26)).toLowerCase());
    }
    for (const r of legacyReqs) {
      if (Number(r.status) === 2) continue; // refunded legacy requesters aren't payers
      requesters.add(r.requester.toLowerCase());
    }
    const codes = await Promise.all(
      [...requesters].map((a) => p.getCode(a).catch(() => "0x"))
    );
    const contractConsumers = codes.filter((c) => c !== "0x").length;
    const uniquePayers = requesters.size - contractConsumers;

    const recent = sentLogs.slice(-10).reverse();
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

    // Legacy coordinator rows - same shape so the table merges seamlessly.
    // legacyReqs already carries each request's struct; the two legacy log
    // scans above supply tx hashes and decoded results.
    const legacyTxById = new Map(
      legacySentLogs.map((l) => [BigInt(l.topics[1]).toString(), l.transactionHash])
    );
    const legacyResults = new Map<string, string>();
    for (const l of legacyFulfilledLogs) {
      try {
        const [, output] = abi.decode(["bytes32", "bytes"], l.data);
        const [text] = abi.decode(["string"], output);
        legacyResults.set(BigInt(l.topics[1]).toString(), text);
      } catch {}
    }
    const legacyRows: RequestRow[] = legacyReqs.map((r, i) => {
      const id = BigInt(i + 1);
      return {
        id,
        requester: r.requester,
        modelId: r.modelId,
        fee: formatEther(r.fee),
        status: STATUS[Number(r.status)] ?? "?",
        ageSec: Math.max(0, now - Number(r.createdAt)),
        operator: Number(r.status) === 1 ? r.operator : null,
        txHash: legacyTxById.get(id.toString()) ?? null,
        result: legacyResults.get(id.toString()) ?? null,
        legacy: true,
      };
    });
    const mergedRows = [...rows, ...legacyRows]
      .sort((a, b) => a.ageSec - b.ageSec)
      .slice(0, 15);

    return {
      block,
      totalRequests: nextId - 1n,
      fulfilled: fulfilledCount,
      feesWei: fees,
      operatorCount: ops,
      minStake: stake,
      models: [...modelMap.values()],
      operators: opList,
      sentinelTicks: ticks,
      sentinelReport: report,
      sentinelReportAt: Number(reportAt),
      sentinelBalance: sentBal,
      sentinelQueryPrice: sentPrice,
      sentinelMinInterval: Number(sentInterval),
      sentinelLastTickAt: Number(sentLastTick),
      requests: mergedRows,
      legacyRequests: legacyTotal,
      legacyFulfilled,
      legacyFeesWei: legacyFees,
      uniquePayers,
      contractConsumers,
    };
  } catch (e) {
    return { ...EMPTY, offline: e instanceof Error ? e.message.slice(0, 160) : "rpc unreachable" };
  }
}
