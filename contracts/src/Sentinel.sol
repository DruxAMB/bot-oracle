// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Initializable} from "openzeppelin-contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "openzeppelin-contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "openzeppelin-contracts-upgradeable/access/OwnableUpgradeable.sol";
import {OracleCoordinator} from "./OracleCoordinator.sol";
import {IOracleConsumer} from "./IOracleConsumer.sol";
import {Strings} from "openzeppelin-contracts/utils/Strings.sol";

/// @notice Sentinel - the oracle's flagship autonomous consumer.
/// On a schedule, it pays the oracle for a market-intel inference from its own
/// funded balance and stores each report on-chain. Every cycle is request +
/// fulfill + callback - the product's own activity feed, visible on the explorer.
/// Anyone may fund() it; the keeper just calls tick().
/// UUPS-upgradeable: the proxy address is permanent; logic upgrades keep it.
contract Sentinel is IOracleConsumer, Initializable, OwnableUpgradeable, UUPSUpgradeable {
    OracleCoordinator public oracle;
    bytes32 public modelId;
    uint256 public queryPrice;
    uint64 public minInterval;
    uint64 public callbackGas;
    string public promptText;

    uint64 public lastTickAt;
    uint256 public tickIndex;
    uint256 public latestRequestId;
    string public latestReport;
    uint64 public latestReportAt;
    uint256 public latestReportRequestId;
    /// @notice requestId -> tickIndex so a delayed fulfill is attributed to the
    /// tick that produced it, not whichever tick happened to be last.
    mapping(uint256 => uint256) public tickOfRequest;

    event Ticked(uint256 indexed tickIndex, uint256 indexed requestId, bytes32 indexed modelId);
    event ReportPosted(uint256 indexed requestId, uint256 indexed tickIndex, string report);

    error TooEarly(uint256 availableAt);
    error InsufficientFunds(uint256 have, uint256 need);
    error NotOracle(address caller);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address owner_,
        address oracle_,
        bytes32 modelId_,
        uint256 queryPrice_,
        uint64 minInterval_,
        uint64 callbackGas_,
        string memory promptText_
    ) external initializer {
        __Ownable_init(owner_);
        oracle = OracleCoordinator(oracle_);
        modelId = modelId_;
        queryPrice = queryPrice_;
        minInterval = minInterval_;
        callbackGas = callbackGas_;
        promptText = promptText_;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// @notice Anyone may top up the query fund - community-sponsored autonomy.
    function fund() external payable {}
    receive() external payable {}

    /// @notice Fire one oracle query if the interval has elapsed. Caller pays
    /// gas only; the query fee comes from this contract's balance. Optionally
    /// accepts a same-call top-up.
    function tick() external payable returns (uint256 requestId) {
        uint256 availableAt = uint256(lastTickAt) + minInterval;
        if (lastTickAt != 0 && block.timestamp < availableAt) revert TooEarly(availableAt);
        if (address(this).balance < queryPrice) revert InsufficientFunds(address(this).balance, queryPrice);

        bytes memory input = abi.encode(
            string.concat(
                promptText,
                " [tick ", Strings.toString(tickIndex), " @ ", Strings.toString(block.timestamp), "]"
            )
        );
        lastTickAt = uint64(block.timestamp);
        requestId = oracle.request{value: queryPrice}(modelId, input, address(this), callbackGas);
        latestRequestId = requestId;
        tickOfRequest[requestId] = tickIndex;
        emit Ticked(tickIndex, requestId, modelId);
        tickIndex++;
    }

    function onOracleResult(uint256 requestId, bytes calldata output) external {
        if (msg.sender != address(oracle)) revert NotOracle(msg.sender);
        (string memory report) = abi.decode(output, (string));
        // Monotonic store: an out-of-order fulfill of an older request must
        // not overwrite a fresher report (multi-operator world).
        if (requestId >= latestReportRequestId) {
            latestReport = report;
            latestReportAt = uint64(block.timestamp);
            latestReportRequestId = requestId;
        }
        emit ReportPosted(requestId, tickOfRequest[requestId], report);
    }

    function setQuery(bytes32 modelId_, uint256 queryPrice_) external onlyOwner {
        modelId = modelId_;
        queryPrice = queryPrice_;
    }

    function setPrompt(string calldata p) external onlyOwner {
        promptText = p;
    }

    function setMinInterval(uint64 v) external onlyOwner {
        minInterval = v;
    }

    function setCallbackGas(uint64 v) external onlyOwner {
        callbackGas = v;
    }

    /// @notice Repoint at a successor coordinator (e.g. if a future
    /// non-upgradeable migration is ever needed) without losing report history.
    function setOracle(address oracle_) external onlyOwner {
        oracle = OracleCoordinator(oracle_);
    }

    /// @notice Recover the query purse - the contract otherwise has no outflow
    /// besides tick() payments, so without this a retired Sentinel strands funds.
    function rescue(address payable to) external onlyOwner {
        (bool ok,) = to.call{value: address(this).balance}("");
        require(ok, "rescue failed");
    }

    /// @dev Storage gap - reserve slots so future versions can add state
    /// variables without shifting the layout of inheriting/upgraded code.
    uint256[50] private __gap;
}
