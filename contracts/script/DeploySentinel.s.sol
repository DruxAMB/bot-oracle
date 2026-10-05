// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "openzeppelin-contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Sentinel} from "../src/Sentinel.sol";

/// Deploy + fund the flagship consumer as a UUPS proxy. The PROXY address is
/// the permanent public address.
/// Env: PRIVATE_KEY, ORACLE_ADDRESS, MODEL_ID, SENTINEL_FUND_WEI (default 2e18)
contract DeploySentinel is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address oracle = vm.envAddress("ORACLE_ADDRESS");
        bytes32 modelId = vm.envBytes32("MODEL_ID");
        uint256 fundWei = vm.envOr("SENTINEL_FUND_WEI", uint256(2 ether));

        vm.startBroadcast(pk);
        Sentinel sentinelImpl = new Sentinel();
        Sentinel sentinel = Sentinel(payable(address(new ERC1967Proxy(
            address(sentinelImpl),
            abi.encodeCall(Sentinel.initialize, (
                deployer,
                oracle,
                modelId,
                0.02 ether,   // must match the model's registry price
                30 minutes,   // mainnet cadence
                300_000,
                "Summarize the state of the BOT Chain ecosystem from the attached data."
            ))
        ))));
        (bool ok,) = address(sentinel).call{value: fundWei}("");
        require(ok, "fund failed");
        vm.stopBroadcast();

        console.log("Sentinel proxy:", address(sentinel));
        console.log("Sentinel impl: ", address(sentinelImpl));
    }
}
