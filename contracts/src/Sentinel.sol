// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "openzeppelin-contracts/access/Ownable.sol";
import {OracleCoordinator} from "./OracleCoordinator.sol";
import {IOracleConsumer} from "./IOracleConsumer.sol";
import {Strings} from "openzeppelin-contracts/utils/Strings.sol";

/// @notice Sentinel — the oracle's flagship autonomous consumer.
/// On a schedule, it pays the oracle for a market-intel inference from its own
/// funded balance and stores each report on-chain. Every cycle is request +
/// fulfill + callback — the product's own activity feed, visible on the explorer.
/// Anyone may fund() it; the keeper just calls tick().
contract Sentinel is IOracleConsumer, Ownable {
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

    event Ticked(uint256 indexed tickIndex, uint256 indexed requestId, bytes32 indexed modelId);
    event ReportPosted(uint256 indexed requestId, uint256 indexed tickIndex, string report);

    error TooEarly(uint256 availableAt);
    error InsufficientFunds(uint256 have, uint256 need);
    error NotOracle(address caller);

    constructor(
        address oracle_,
        bytes32 modelId_,
        uint256 queryPrice_,
        uint64 minInterval_,
        uint64 callbackGas_,
        string memory promptText_
    ) Ownable(msg.sender) {
        oracle = OracleCoordinator(oracle_);
        modelId = modelId_;
        queryPrice = queryPrice_;
        minInterval = minInterval_;
        callbackGas = callbackGas_;
        promptText = promptText_;
    }

    /// @notice Anyone may top up the query fund — community-sponsored autonomy.
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
        requestId = oracle.request{value: queryPrice}(modelId, input, address(this), callbackGas);
        lastTickAt = uint64(block.timestamp);
        latestRequestId = requestId;
        emit Ticked(tickIndex, requestId, modelId);
        tickIndex++;
    }

    function onOracleResult(uint256 requestId, bytes calldata output) external {
        if (msg.sender != address(oracle)) revert NotOracle(msg.sender);
        (string memory report) = abi.decode(output, (string));
        latestReport = report;
        latestReportAt = uint64(block.timestamp);
        emit ReportPosted(requestId, tickIndex == 0 ? 0 : tickIndex - 1, report);
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
}
