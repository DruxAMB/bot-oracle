// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {UUPSUpgradeable} from "openzeppelin-contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ModelRegistry} from "../src/ModelRegistry.sol";
import {OperatorRegistry} from "../src/OperatorRegistry.sol";
import {OracleCoordinator} from "../src/OracleCoordinator.sol";
import {Sentinel} from "../src/Sentinel.sol";

/// Upgrade a deployed proxy to a freshly-built implementation - the public
/// address never changes; all state carries over. Caller (PRIVATE_KEY) must be
/// the proxy owner.
/// Env: PRIVATE_KEY, TARGET (models|operators|coordinator|sentinel), PROXY
contract Upgrade is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        string memory target = vm.envString("TARGET");
        address proxy = vm.envAddress("PROXY");

        vm.startBroadcast(pk);
        address impl = _deployImpl(target);
        UUPSUpgradeable(proxy).upgradeToAndCall(impl, "");
        vm.stopBroadcast();

        console.log("Upgraded", target, "proxy", proxy);
        console.log("New implementation:", impl);
    }

    function _deployImpl(string memory target) internal returns (address) {
        bytes32 t = keccak256(bytes(target));
        if (t == keccak256("models")) return address(new ModelRegistry());
        if (t == keccak256("operators")) return address(new OperatorRegistry());
        if (t == keccak256("coordinator")) return address(new OracleCoordinator());
        if (t == keccak256("sentinel")) return address(new Sentinel());
        revert("unknown TARGET");
    }
}
