// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// Minimal oracle consumer — clone this, point it at the deployed coordinator,
/// implement IOracleConsumer, fund it, done.
/// Testnet coordinator: 0x7F7e5256cA568B981e1a09642d8F756D9c89F706 (chain 968)
interface IOracleCoordinator {
    function request(
        bytes32 modelId,
        bytes calldata input,
        address callbackContract,
        uint64 callbackGasLimit
    ) external payable returns (uint256 requestId);
}

contract StarterConsumer {
    IOracleCoordinator public immutable oracle;
    bytes32 public modelId;
    uint256 public queryPrice;
    string public latestResult;
    uint256 public latestRequestId;

    event ResultPosted(uint256 indexed requestId, string result);

    constructor(address oracle_, bytes32 modelId_, uint256 queryPrice_) {
        oracle = IOracleCoordinator(oracle_);
        modelId = modelId_;
        queryPrice = queryPrice_;
    }

    receive() external payable {}

    /// Fire a query. Fee comes from this contract's balance.
    function ask(bytes calldata input) external returns (uint256 requestId) {
        requestId = oracle.request{value: queryPrice}(modelId, input, address(this), 300_000);
        latestRequestId = requestId;
    }

    /// The coordinator calls this with the result.
    function onOracleResult(uint256 requestId, bytes calldata output) external {
        require(msg.sender == address(oracle), "not oracle");
        latestResult = abi.decode(output, (string));
        emit ResultPosted(requestId, latestResult);
    }
}
