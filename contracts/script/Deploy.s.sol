// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "openzeppelin-contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ModelRegistry} from "../src/ModelRegistry.sol";
import {OperatorRegistry} from "../src/OperatorRegistry.sol";
import {OracleCoordinator} from "../src/OracleCoordinator.sol";

/// Deploy the oracle stack as UUPS proxies. The PROXY addresses are the public
/// contract addresses - permanent across upgrades. Implementations are throwaway.
/// Env: PRIVATE_KEY, TREASURY
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address treasury = vm.envAddress("TREASURY");

        vm.startBroadcast(pk);

        ModelRegistry modelsImpl = new ModelRegistry();
        ModelRegistry models = ModelRegistry(address(new ERC1967Proxy(
            address(modelsImpl), abi.encodeCall(ModelRegistry.initialize, (deployer))
        )));

        OperatorRegistry operatorsImpl = new OperatorRegistry();
        OperatorRegistry operators = OperatorRegistry(address(new ERC1967Proxy(
            address(operatorsImpl), abi.encodeCall(OperatorRegistry.initialize, (deployer, 0.1 ether, 1 hours))
        )));

        OracleCoordinator coordinatorImpl = new OracleCoordinator();
        OracleCoordinator coordinator = OracleCoordinator(address(new ERC1967Proxy(
            address(coordinatorImpl),
            abi.encodeCall(OracleCoordinator.initialize, (
                deployer,
                address(models),
                address(operators),
                treasury,
                1000,          // 10% protocol cut
                1 hours,       // request timeout
                1 days,        // challenge window
                0.01 ether     // challenge bond
            ))
        )));
        operators.setSlasher(address(coordinator));

        // Seed models. Prices in wei-BOT; echo model for pipeline tests.
        models.setModel(keccak256("echo:v1"), 0.01 ether, keccak256("echo-v1"), "echo:local", true);
        models.setModel(keccak256("gpt-4o-mini:v1"), 0.05 ether, keccak256("gpt4omini-v1"), "openai:gpt-4o-mini", true);
        models.setModel(keccak256("sentinel:v1"), 0.02 ether, keccak256("sentinel-v1"), "sentinel:v1", true);

        vm.stopBroadcast();

        // These PROXY addresses are what frontends/SDKs/nodes point at - forever.
        console.log("ModelRegistry proxy:     ", address(models));
        console.log("OperatorRegistry proxy:  ", address(operators));
        console.log("OracleCoordinator proxy: ", address(coordinator));
        console.log("ModelRegistry impl:      ", address(modelsImpl));
        console.log("OperatorRegistry impl:   ", address(operatorsImpl));
        console.log("OracleCoordinator impl:  ", address(coordinatorImpl));
    }
}
