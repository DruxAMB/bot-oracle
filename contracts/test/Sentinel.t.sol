// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "openzeppelin-contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {OracleCoordinator} from "../src/OracleCoordinator.sol";
import {OperatorRegistry} from "../src/OperatorRegistry.sol";
import {ModelRegistry} from "../src/ModelRegistry.sol";
import {Sentinel} from "../src/Sentinel.sol";

contract SentinelV2Mock is Sentinel {
    function version() external pure returns (uint256) {
        return 2;
    }
}

contract SentinelTest is Test {
    OracleCoordinator coordinator;
    OperatorRegistry operators;
    ModelRegistry models;
    Sentinel sentinel;

    address treasury = makeAddr("treasury");
    address operator = makeAddr("operator");
    address keeper = makeAddr("keeper");

    bytes32 constant MODEL = keccak256("echo:v1");
    uint256 constant PRICE = 0.001 ether;
    uint64 constant INTERVAL = 15 minutes;

    function _deploySentinel() internal returns (Sentinel) {
        return Sentinel(payable(address(new ERC1967Proxy(
            address(new Sentinel()),
            abi.encodeCall(Sentinel.initialize, (
                address(this), address(coordinator), MODEL, PRICE, INTERVAL, 300_000,
                "Report on BOT Chain ecosystem state."
            ))
        ))));
    }

    function setUp() public {
        models = ModelRegistry(address(new ERC1967Proxy(
            address(new ModelRegistry()),
            abi.encodeCall(ModelRegistry.initialize, (address(this)))
        )));
        operators = OperatorRegistry(address(new ERC1967Proxy(
            address(new OperatorRegistry()),
            abi.encodeCall(OperatorRegistry.initialize, (address(this), 0.1 ether, 1 hours))
        )));
        coordinator = OracleCoordinator(address(new ERC1967Proxy(
            address(new OracleCoordinator()),
            abi.encodeCall(OracleCoordinator.initialize, (
                address(this), address(models), address(operators), treasury, 1000, 1 hours, 1 days, 0.01 ether
            ))
        )));
        operators.setSlasher(address(coordinator));
        models.setModel(MODEL, PRICE, keccak256("echo-v1"), "echo:local", true);
        sentinel = _deploySentinel();
        vm.deal(operator, 10 ether);
        vm.prank(operator);
        operators.register{value: 0.1 ether}("https://node.local");
        vm.deal(address(sentinel), 1 ether);
    }

    function test_tickRequestsOracle() public {
        uint256 id = sentinel.tick();
        (address requester,,,,,,,, OracleCoordinator.Status status,,,) = coordinator.requests(id);
        assertEq(requester, address(sentinel));
        assertEq(uint256(status), uint256(OracleCoordinator.Status.Pending));
        assertEq(sentinel.latestRequestId(), id);
        assertEq(sentinel.tickIndex(), 1);
    }

    function test_tickRespectsInterval() public {
        sentinel.tick();
        vm.expectRevert();
        sentinel.tick();
        vm.warp(block.timestamp + INTERVAL + 1);
        sentinel.tick(); // second tick ok
        assertEq(sentinel.tickIndex(), 2);
    }

    function test_tickRevertsWhenUnfunded() public {
        Sentinel poor = _deploySentinel();
        vm.expectRevert(abi.encodeWithSelector(Sentinel.InsufficientFunds.selector, 0, PRICE));
        poor.tick();
    }

    function test_fullCycleLandsReport() public {
        uint256 id = sentinel.tick();
        bytes memory output = abi.encode("WBOT flat; 2 new pairs this week.");
        vm.prank(operator);
        coordinator.fulfill(id, output);
        assertEq(sentinel.latestReport(), "WBOT flat; 2 new pairs this week.");
        assertGt(sentinel.latestReportAt(), 0);
    }

    function test_onResultRejectsNonOracle() public {
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(Sentinel.NotOracle.selector, keeper));
        sentinel.onOracleResult(1, abi.encode("fake"));
    }

    function test_outOfOrderFulfillKeepsFresherReport() public {
        uint256 id1 = sentinel.tick();
        vm.warp(block.timestamp + INTERVAL + 1);
        uint256 id2 = sentinel.tick();
        vm.startPrank(operator);
        coordinator.fulfill(id2, abi.encode("newer report"));
        coordinator.fulfill(id1, abi.encode("stale report"));
        vm.stopPrank();
        assertEq(sentinel.latestReport(), "newer report");
    }

    function test_reRegisterAfterWithdrawRestoresActive() public {
        vm.startPrank(operator);
        operators.requestUnstake();
        vm.warp(block.timestamp + 1 hours + 1);
        operators.withdrawStake();
        operators.register{value: 0.1 ether}("https://node.local");
        vm.stopPrank();
        assertTrue(operators.isActiveOperator(operator));
    }

    function test_delayedFulfillAttributesOriginTick() public {
        uint256 id1 = sentinel.tick(); // tick 0
        vm.warp(block.timestamp + INTERVAL + 1);
        uint256 id2 = sentinel.tick(); // tick 1
        vm.startPrank(operator);
        coordinator.fulfill(id2, abi.encode("newer report"));
        // A fulfill delayed past a later tick must still attribute tick 0.
        vm.expectEmit(true, true, false, true);
        emit Sentinel.ReportPosted(id1, 0, "stale report");
        coordinator.fulfill(id1, abi.encode("stale report"));
        vm.stopPrank();
    }

    function test_rescueReturnsPurse() public {
        address recv = makeAddr("recv");
        uint256 bal = address(sentinel).balance;
        sentinel.rescue(payable(recv));
        assertEq(address(sentinel).balance, 0);
        assertEq(recv.balance, bal);
    }

    function test_setOracleRepoints() public {
        OracleCoordinator other = OracleCoordinator(address(new ERC1967Proxy(
            address(new OracleCoordinator()),
            abi.encodeCall(OracleCoordinator.initialize, (
                address(this), address(models), address(operators), treasury, 0, 1 hours, 1 days, 0.01 ether
            ))
        )));
        sentinel.setOracle(address(other));
        assertEq(address(sentinel.oracle()), address(other));
    }

    function test_tickAcceptsTopUp() public {
        Sentinel poor = _deploySentinel();
        vm.deal(keeper, 1 ether);
        vm.prank(keeper);
        poor.tick{value: PRICE}();
        assertEq(poor.tickIndex(), 1);
    }

    function test_upgradePreservesPurseReportAndCadence() public {
        uint256 id = sentinel.tick();
        vm.prank(operator);
        coordinator.fulfill(id, abi.encode("pre-upgrade report"));
        uint256 purse = address(sentinel).balance;
        address proxy = address(sentinel);

        sentinel.upgradeToAndCall(address(new SentinelV2Mock()), "");

        assertEq(address(sentinel), proxy);
        assertEq(address(sentinel).balance, purse);
        assertEq(sentinel.latestReport(), "pre-upgrade report");
        assertEq(sentinel.tickIndex(), 1);
        assertEq(SentinelV2Mock(payable(proxy)).version(), 2);
        // Cadence + tick flow still enforced against pre-upgrade lastTickAt.
        vm.expectRevert(abi.encodeWithSelector(Sentinel.TooEarly.selector, sentinel.lastTickAt() + INTERVAL));
        sentinel.tick();
        vm.warp(block.timestamp + INTERVAL + 1);
        sentinel.tick();
        assertEq(sentinel.tickIndex(), 2);
    }
}
