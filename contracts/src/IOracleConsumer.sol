// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Implement this in the contract that should receive oracle results.
interface IOracleConsumer {
    /// @param requestId The id returned by OracleCoordinator.request()
    /// @param output The model output payload (ABI-encoded by the node; format is model-defined)
    function onOracleResult(uint256 requestId, bytes calldata output) external;
}
