// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {ModelRegistry} from "../src/ModelRegistry.sol";
import {OperatorRegistry} from "../src/OperatorRegistry.sol";
import {OracleCoordinator} from "../src/OracleCoordinator.sol";

/// Deploy the oracle stack. Testnet params are lenient (low stake/bond).
/// Env: PRIVATE_KEY, TREASURY
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address treasury = vm.envAddress("TREASURY");

        vm.startBroadcast(pk);

        ModelRegistry models = new ModelRegistry();
        OperatorRegistry operators = new OperatorRegistry(0.1 ether, 1 hours);
        OracleCoordinator coordinator = new OracleCoordinator(
            address(models),
            address(operators),
            treasury,
            1000,          // 10% protocol cut
            1 hours,       // request timeout
            1 days,        // challenge window
            0.01 ether     // challenge bond
        );
        operators.setSlasher(address(coordinator));

        // Seed models. Prices in wei-BOT; echo model for pipeline tests.
        models.setModel(keccak256("echo:v1"), 0.01 ether, keccak256("echo-v1"), "echo:local", true);
        models.setModel(keccak256("gpt-4o-mini:v1"), 0.05 ether, keccak256("gpt4omini-v1"), "openai:gpt-4o-mini", true);
        models.setModel(keccak256("sentinel:v1"), 0.02 ether, keccak256("sentinel-v1"), "sentinel:v1", true);

        vm.stopBroadcast();

        console.log("ModelRegistry:", address(models));
        console.log("OperatorRegistry:", address(operators));
        console.log("OracleCoordinator:", address(coordinator));
    }
}
