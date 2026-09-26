// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {Sentinel} from "../src/Sentinel.sol";

/// Deploy + fund the flagship consumer. Env: PRIVATE_KEY, ORACLE_ADDRESS, MODEL_ID
contract DeploySentinel is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address oracle = vm.envAddress("ORACLE_ADDRESS");
        bytes32 modelId = vm.envBytes32("MODEL_ID");

        vm.startBroadcast(pk);
        Sentinel sentinel = new Sentinel(
            oracle,
            modelId,
            0.001 ether,  // must match the model's registry price
            5 minutes,    // testnet cadence; mainnet uses 30-60min
            300_000,
            "Summarize the state of the BOT Chain ecosystem from the attached data."
        );
        (bool ok,) = address(sentinel).call{value: 0.5 ether}("");
        require(ok, "fund failed");
        vm.stopBroadcast();

        console.log("Sentinel:", address(sentinel));
    }
}
