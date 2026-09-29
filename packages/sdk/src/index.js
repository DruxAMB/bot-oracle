// @bot-oracle/sdk — thin client over the OracleCoordinator.
// request() escrows the fee, awaitResult() resolves when the node fulfills,
// verifyResult() recomputes the on-chain outputHash.
import { JsonRpcProvider, Contract, AbiCoder, keccak256, toUtf8Bytes } from "ethers";

export const STATUS = { PENDING: 0, FULFILLED: 1, REFUNDED: 2, DISPUTED: 3, RESOLVED: 4 };

const COORD_ABI = [
  "function request(bytes32 modelId, bytes input, address callbackContract, uint64 callbackGasLimit) payable returns (uint256)",
  "function requests(uint256) view returns (address requester, bytes32 modelId, bytes32 inputHash, uint256 fee, address callbackContract, uint64 callbackGasLimit, uint64 createdAt, uint64 fulfilledAt, uint8 status, bytes32 outputHash, address operator, address challenger)",
  "event RequestSent(uint256 indexed requestId, address indexed requester, bytes32 indexed modelId, bytes32 inputHash, bytes input, address callbackContract)",
  "event RequestFulfilled(uint256 indexed requestId, address indexed operator, bytes32 outputHash, bytes output)",
];
const MODELS_ABI = ["function models(bytes32) view returns (uint256 priceWei, bytes32 containerHash, string backend, bool active)"];

const abi = AbiCoder.defaultAbiCoder();

export class OracleClient {
  /**
   * @param {object} opts
   * @param {string} opts.rpcUrl
   * @param {number} opts.chainId
   * @param {string} opts.coordinator - OracleCoordinator address
   * @param {string} [opts.models] - ModelRegistry address (for priceOf lookups)
   * @param {import("ethers").Signer} [opts.signer] - required for request()
   */
  constructor({ rpcUrl, chainId, coordinator, models, signer }) {
    this.provider = new JsonRpcProvider(rpcUrl, chainId);
    this.coordinator = new Contract(coordinator, COORD_ABI, signer ?? this.provider);
    this.models = models ? new Contract(models, MODELS_ABI, this.provider) : null;
    this.abi = abi;
  }

  /** modelId helpers — ids are keccak256("name:version") per convention. */
  static modelId(name) {
    return keccak256(toUtf8Bytes(name));
  }

  /** Encode a plain-text prompt the way parsePrompt on the node expects. */
  static encodePrompt(text) {
    return abi.encode(["string"], [text]);
  }

  /**
   * Send a request. `value` must equal the model's priceWei.
   * Returns { requestId, txHash }.
   */
  async request({ modelId, prompt, input, callbackContract = null, callbackGas = 0n, value }) {
    const payload = input ?? OracleClient.encodePrompt(prompt);
    const cb = callbackContract ?? "0x0000000000000000000000000000000000000000";
    const tx = await this.coordinator.request(modelId, payload, cb, callbackGas, { value });
    const receipt = await tx.wait();
    if (!receipt || receipt.status === 0) {
      throw new Error(`request tx reverted — check ${tx.hash} on the explorer`);
    }
    const log = receipt.logs
      .map((l) => { try { return this.coordinator.interface.parseLog(l); } catch { return null; } })
      .find((x) => x?.name === "RequestSent");
    const requestId = log?.args?.requestId;
    if (requestId === undefined || requestId === null) {
      throw new Error(`RequestSent missing from receipt of ${tx.hash}`);
    }
    return { requestId, txHash: tx.hash };
  }

  /** Poll until the request is fulfilled (or throws on refund/timeout). */
  async awaitResult(requestId, { timeoutMs = 120_000, pollMs = 3_000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const r = await this.coordinator.requests(requestId);
      const s = Number(r.status);
      if (s === STATUS.FULFILLED || s === STATUS.RESOLVED) {
        const outputHash = r.outputHash;
        return { requestId, status: s, outputHash, operator: r.operator };
      }
      if (s === STATUS.REFUNDED || s === STATUS.DISPUTED) {
        throw new Error(`request ${requestId} ended in status ${s}`);
      }
      await new Promise((r2) => setTimeout(r2, pollMs));
    }
    throw new Error(`request ${requestId} not fulfilled within ${timeoutMs}ms`);
  }

  /** Model's per-query price — pass as `value` to request(). */
  async priceOf(modelId) {
    if (!this.models) throw new Error("models registry not configured");
    const m = await this.models.models(modelId);
    if (!m.active) throw new Error(`model ${modelId} inactive or unknown`);
    return m.priceWei;
  }

  /** Fetch the delivered output from the RequestFulfilled event. */
  async getResult(requestId) {
    const r = await this.coordinator.requests(requestId);
    const s = Number(r.status);
    if (s !== STATUS.FULFILLED && s !== STATUS.RESOLVED) {
      throw new Error(`request ${requestId} not fulfilled (status ${s})`);
    }
    const filter = this.coordinator.filters.RequestFulfilled(requestId);
    const logs = await this.coordinator.queryFilter(filter);
    const output = logs[0]?.args?.output;
    return output ? abi.decode(["string"], output)[0] : null;
  }

  /** Recompute keccak256(abi.encode(string, text)) and compare on-chain. */
  async verifyResult(requestId, text) {
    const r = await this.coordinator.requests(requestId);
    return r.outputHash === keccak256(abi.encode(["string"], [text]));
  }
}

export default OracleClient;
