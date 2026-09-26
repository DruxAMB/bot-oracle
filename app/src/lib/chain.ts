import { JsonRpcProvider, Contract, formatEther } from "ethers";

export const NET = {
  name: process.env.NEXT_PUBLIC_NET_NAME ?? "BOT Chain Testnet",
  rpc: process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.bohr.life",
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "968"),
  explorer: process.env.NEXT_PUBLIC_EXPLORER ?? "https://scan.bohr.life",
  coordinator: process.env.NEXT_PUBLIC_COORDINATOR ?? "0x7F7e5256cA568B981e1a09642d8F756D9c89F706",
  models: process.env.NEXT_PUBLIC_MODELS ?? "0x8f487264E1B183F588CAc678D000754D3bd9B07E",
  registry: process.env.NEXT_PUBLIC_REGISTRY ?? "0x824271cc9f2A1556e4ecB6287830f200F92DB9Da",
  sentinel: process.env.NEXT_PUBLIC_SENTINEL ?? "0x0245cc872b5F51197dDE6E0dc3b7A21a3c55F787",
};

const COORD_ABI = [
  "function nextRequestId() view returns (uint256)",
  "function accruedProtocolFees() view returns (uint256)",
  "function requests(uint256) view returns (address requester, bytes32 modelId, bytes32 inputHash, uint256 fee, address callbackContract, uint64 callbackGasLimit, uint64 createdAt, uint64 fulfilledAt, uint8 status, bytes32 outputHash, address operator, address challenger)",
  "event RequestSent(uint256 indexed requestId, address indexed requester, bytes32 indexed modelId, bytes32 inputHash, bytes input, address callbackContract)",
  "event RequestFulfilled(uint256 indexed requestId, address indexed operator, bytes32 outputHash, bytes output)",
];
const REG_ABI = ["function operatorCount() view returns (uint256)", "function minStake() view returns (uint256)"];
const SENT_ABI = [
  "function latestReport() view returns (string)",
  "function latestReportAt() view returns (uint64)",
  "function tickIndex() view returns (uint256)",
  "function modelId() view returns (bytes32)",
];

const STATUS = ["Pending", "Fulfilled", "Refunded", "Disputed", "Resolved"] as const;

export type RequestRow = {
  id: bigint;
  requester: string;
  modelId: string;
  fee: string;
  status: string;
  ageSec: number;
  operator: string | null;
};

export type DashData = {
  block: number;
  totalRequests: bigint;
  fulfilled: number;
  feesWei: bigint;
  operatorCount: bigint;
  minStake: bigint;
  sentinelTicks: bigint;
  sentinelReport: string;
  sentinelReportAt: number;
  requests: RequestRow[];
  offline?: string;
};

export async function loadDash(): Promise<DashData> {
  try {
    const p = new JsonRpcProvider(NET.rpc, NET.chainId);
    const coord = new Contract(NET.coordinator, COORD_ABI, p);
    const reg = new Contract(NET.registry, REG_ABI, p);
    const sent = new Contract(NET.sentinel, SENT_ABI, p);

    const [block, nextId, fees, ops, stake, ticks, report, reportAt] = await Promise.all([
      p.getBlockNumber(),
      coord.nextRequestId(),
      coord.accruedProtocolFees(),
      reg.operatorCount(),
      reg.minStake(),
      sent.tickIndex(),
      sent.latestReport().catch(() => ""),
      sent.latestReportAt().catch(() => 0n),
    ]);

    const total = nextId - 1n;
    const sentLogs = await p.getLogs({
      address: NET.coordinator,
      topics: [coord.interface.getEvent("RequestSent")!.topicHash],
      fromBlock: Math.max(0, block - 50_000),
      toBlock: "latest",
    });
    const fulfilledLogs = await p.getLogs({
      address: NET.coordinator,
      topics: [coord.interface.getEvent("RequestFulfilled")!.topicHash],
      fromBlock: Math.max(0, block - 50_000),
      toBlock: "latest",
    });

    const recent = sentLogs.slice(-15).reverse();
    const now = Math.floor(Date.now() / 1000);
    const rows: RequestRow[] = await Promise.all(
      recent.map(async (l) => {
        const id = BigInt(l.topics[1]);
        const r = await coord.requests(id);
        return {
          id,
          requester: l.topics[2],
          modelId: l.topics[3],
          fee: formatEther(r.fee),
          status: STATUS[Number(r.status)] ?? "?",
          ageSec: Math.max(0, now - Number(r.createdAt)),
          operator: Number(r.status) === 1 ? r.operator : null,
        };
      })
    );

    return {
      block,
      totalRequests: total,
      fulfilled: fulfilledLogs.length,
      feesWei: fees,
      operatorCount: ops,
      minStake: stake,
      sentinelTicks: ticks,
      sentinelReport: report,
      sentinelReportAt: Number(reportAt),
      requests: rows,
    };
  } catch (e) {
    return {
      block: 0, totalRequests: 0n, fulfilled: 0, feesWei: 0n, operatorCount: 0n,
      minStake: 0n, sentinelTicks: 0n, sentinelReport: "", sentinelReportAt: 0,
      requests: [], offline: e instanceof Error ? e.message.slice(0, 160) : "rpc unreachable",
    };
  }
}
