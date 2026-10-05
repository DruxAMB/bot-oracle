// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Initializable} from "openzeppelin-contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "openzeppelin-contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "openzeppelin-contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/utils/ReentrancyGuard.sol";
import {ModelRegistry} from "./ModelRegistry.sol";
import {OperatorRegistry} from "./OperatorRegistry.sol";
import {IOracleConsumer} from "./IOracleConsumer.sol";

/// @notice Request/response AI oracle: consumers escrow a fee per query,
/// registered operators run inference off-chain and fulfill on-chain.
/// Trust model v1: single staked operator set, slashable by an arbitrator -
/// honest centralization, with multi-operator consensus on the roadmap.
/// Fees are native BOT only; USDT billing arrives with the subscription vault.
/// UUPS-upgradeable: the proxy address is permanent; logic upgrades keep it.
/// @dev ReentrancyGuard uses ERC-7201 namespaced storage in OZ 5.7 - safe in
/// upgradeable contracts with no initializer needed.
contract OracleCoordinator is Initializable, OwnableUpgradeable, ReentrancyGuard, UUPSUpgradeable {
    enum Status {
        Pending,
        Fulfilled,
        Refunded,
        Disputed,
        Resolved
    }

    struct Request {
        address requester;
        bytes32 modelId;
        bytes32 inputHash;
        uint256 fee;
        address callbackContract;
        uint64 callbackGasLimit;
        uint64 createdAt;
        uint64 fulfilledAt;
        Status status;
        bytes32 outputHash;
        address operator;
        address challenger;
    }

    /// @dev Storage, not immutable - a proxy's state lives in the proxy, so
    /// anything baked into impl bytecode would be invisible/wrong here.
    ModelRegistry public models;
    OperatorRegistry public operators;
    address public treasury;
    uint16 public protocolFeeBps;
    uint64 public requestTimeout;
    uint64 public challengeWindow;
    uint256 public challengeBond;
    uint64 public minCallbackGas;
    /// @notice Hard ceiling on the gas a consumer's callback may burn - the
    /// OPERATOR pays that gas inside fulfill(), so an unbounded limit is a
    /// griefing vector on the fulfilling operator.
    uint64 public maxCallbackGas;

    uint256 public nextRequestId;
    uint256 public accruedProtocolFees;
    mapping(uint256 => Request) public requests;
    /// @notice Pull-balance fallback for recipients that can't accept a bare
    /// value transfer - keeps fulfill/refund/resolve unbrickable.
    mapping(address => uint256) public withdrawable;

    /// @dev `input` rides in the event payload - the node reads it from logs,
    /// consumers don't pay storage for it, `inputHash` keeps it honest.
    event RequestSent(
        uint256 indexed requestId,
        address indexed requester,
        bytes32 indexed modelId,
        bytes32 inputHash,
        bytes input,
        address callbackContract
    );
    event RequestFulfilled(uint256 indexed requestId, address indexed operator, bytes32 outputHash, bytes output);
    event CallbackResult(uint256 indexed requestId, bool ok);
    event RequestRefunded(uint256 indexed requestId, address indexed requester, uint256 fee);
    event Challenged(uint256 indexed requestId, address indexed challenger, uint256 bond);
    event ChallengeResolved(uint256 indexed requestId, bool challengerWins);
    event TreasuryWithdrawn(address indexed to, uint256 amount);
    event WithdrawableCredited(address indexed to, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    error WrongFee(uint256 sent, uint256 required);
    error NotPending(uint256 requestId, Status status);
    error NotFulfilled(uint256 requestId, Status status);
    error NotTimedOut(uint256 requestId);
    error NotAnOperator(address caller);
    error WrongBond(uint256 sent, uint256 required);
    error ChallengeWindowClosed(uint256 requestId);
    error ZeroAddress();
    error CallbackGasTooLow(uint64 given, uint256 min);
    error CallbackGasTooHigh(uint64 given, uint256 max);
    error NothingToWithdraw();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address owner_,
        address models_,
        address operators_,
        address treasury_,
        uint16 protocolFeeBps_,
        uint64 requestTimeout_,
        uint64 challengeWindow_,
        uint256 challengeBond_
    ) external initializer {
        if (models_ == address(0) || operators_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        __Ownable_init(owner_);
        models = ModelRegistry(models_);
        operators = OperatorRegistry(operators_);
        treasury = treasury_;
        protocolFeeBps = protocolFeeBps_;
        requestTimeout = requestTimeout_;
        challengeWindow = challengeWindow_;
        challengeBond = challengeBond_;
        minCallbackGas = 50_000;
        maxCallbackGas = 1_000_000;
        nextRequestId = 1;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// @notice Escrow `modelId`'s price and open a request. The node picks it up
    /// from the RequestSent event, runs inference, and calls fulfill().
    function request(
        bytes32 modelId,
        bytes calldata input,
        address callbackContract,
        uint64 callbackGasLimit
    ) external payable returns (uint256 requestId) {
        uint256 price = models.priceOf(modelId);
        if (msg.value != price) revert WrongFee(msg.value, price);
        if (callbackContract != address(0)) {
            if (callbackGasLimit < minCallbackGas) {
                revert CallbackGasTooLow(callbackGasLimit, minCallbackGas);
            }
            if (callbackGasLimit > maxCallbackGas) {
                revert CallbackGasTooHigh(callbackGasLimit, maxCallbackGas);
            }
        }

        requestId = nextRequestId++;
        Request storage r = requests[requestId];
        r.requester = msg.sender;
        r.modelId = modelId;
        r.inputHash = keccak256(input);
        r.fee = msg.value;
        r.callbackContract = callbackContract;
        r.callbackGasLimit = callbackGasLimit;
        r.createdAt = uint64(block.timestamp);
        r.status = Status.Pending;

        emit RequestSent(requestId, msg.sender, modelId, r.inputHash, input, callbackContract);
    }

    /// @notice Operator delivers the result. Pays out fee minus protocol cut and
    /// invokes the consumer callback - a reverting callback never blocks the
    /// fulfill (the result still lands on-chain, consumable by polling).
    function fulfill(uint256 requestId, bytes calldata output) external nonReentrant {
        if (!operators.isActiveOperator(msg.sender)) revert NotAnOperator(msg.sender);
        Request storage r = requests[requestId];
        if (r.status != Status.Pending) revert NotPending(requestId, r.status);

        r.status = Status.Fulfilled;
        r.fulfilledAt = uint64(block.timestamp);
        r.outputHash = keccak256(output);
        r.operator = msg.sender;

        uint256 cut = (r.fee * protocolFeeBps) / 10_000;
        accruedProtocolFees += cut;
        _pay(msg.sender, r.fee - cut);

        if (r.callbackContract != address(0)) {
            (bool ok,) = r.callbackContract.call{gas: r.callbackGasLimit}(
                abi.encodeCall(IOracleConsumer.onOracleResult, (requestId, output))
            );
            emit CallbackResult(requestId, ok);
        }
        emit RequestFulfilled(requestId, msg.sender, r.outputHash, output);
    }

    /// @notice Anyone may refund a request the operator failed to serve in time.
    function refundIfTimedOut(uint256 requestId) external nonReentrant {
        Request storage r = requests[requestId];
        if (r.status != Status.Pending) revert NotPending(requestId, r.status);
        if (block.timestamp <= r.createdAt + requestTimeout) revert NotTimedOut(requestId);
        r.status = Status.Refunded;
        emit RequestRefunded(requestId, r.requester, r.fee);
        _pay(r.requester, r.fee);
    }

    /// @notice Post a bond disputing a fulfilled result inside the challenge
    /// window. v1 resolution is by the arbitrator (owner); fraud-proof
    /// resolution is the roadmap upgrade.
    function challenge(uint256 requestId) external payable {
        Request storage r = requests[requestId];
        if (r.status != Status.Fulfilled) revert NotFulfilled(requestId, r.status);
        if (block.timestamp > r.fulfilledAt + challengeWindow) revert ChallengeWindowClosed(requestId);
        if (msg.value != challengeBond) revert WrongBond(msg.value, challengeBond);
        r.status = Status.Disputed;
        r.challenger = msg.sender;
        emit Challenged(requestId, msg.sender, msg.value);
    }

    /// @notice Arbitrator resolves a dispute. Challenger wins: bond returned,
    /// requester refunded and bounty paid from the operator's stake. Loses:
    /// bond to treasury, request restored to Resolved.
    function resolveChallenge(uint256 requestId, bool challengerWins) external onlyOwner nonReentrant {
        Request storage r = requests[requestId];
        if (r.status != Status.Disputed) revert NotPending(requestId, r.status);
        r.status = Status.Resolved;
        address challenger = r.challenger;
        uint256 bond = challengeBond;

        if (challengerWins) {
            operators.slash(r.operator, r.fee, r.requester);
            operators.slash(r.operator, bond, challenger);
            _pay(challenger, bond);
        } else {
            accruedProtocolFees += bond;
        }
        emit ChallengeResolved(requestId, challengerWins);
    }

    function withdrawTreasury() external nonReentrant {
        uint256 amount = accruedProtocolFees;
        accruedProtocolFees = 0;
        emit TreasuryWithdrawn(treasury, amount);
        _pay(treasury, amount);
    }

    /// @dev Push-then-pull settlement: try a direct transfer; a recipient that
    /// can't accept a bare call gets a withdrawable balance instead. This is
    /// what keeps fulfill/refund/resolve unbrickable no matter what kind of
    /// contract sits on the receiving end.
    function _pay(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) {
            withdrawable[to] += amount;
            emit WithdrawableCredited(to, amount);
        }
    }

    /// @notice Claim a balance credited when a direct transfer failed.
    function withdraw() external nonReentrant {
        uint256 amount = withdrawable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        withdrawable[msg.sender] = 0;
        emit Withdrawn(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "withdraw failed");
    }

    function setTreasury(address t) external onlyOwner {
        if (t == address(0)) revert ZeroAddress();
        treasury = t;
    }

    /// @notice Protocol take is hard-capped at 20% - bounds the worst the
    /// owner key can ever do to requester fees.
    function setProtocolFeeBps(uint16 bps) external onlyOwner {
        require(bps <= 2_000, "bps > 20%");
        protocolFeeBps = bps;
    }

    function setTimeouts(uint64 requestTimeout_, uint64 challengeWindow_) external onlyOwner {
        requestTimeout = requestTimeout_;
        challengeWindow = challengeWindow_;
    }

    function setChallengeBond(uint256 bond) external onlyOwner {
        challengeBond = bond;
    }

    function setCallbackGasBounds(uint64 lo, uint64 hi) external onlyOwner {
        require(lo <= hi, "lo > hi");
        minCallbackGas = lo;
        maxCallbackGas = hi;
    }

    /// @dev Storage gap - reserve slots so future versions can add state
    /// variables without shifting the layout of inheriting/upgraded code.
    uint256[50] private __gap;
}
