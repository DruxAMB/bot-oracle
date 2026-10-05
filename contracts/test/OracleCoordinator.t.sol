// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "openzeppelin-contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Initializable} from "openzeppelin-contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "openzeppelin-contracts-upgradeable/access/OwnableUpgradeable.sol";
import {OracleCoordinator} from "../src/OracleCoordinator.sol";
import {OperatorRegistry} from "../src/OperatorRegistry.sol";
import {ModelRegistry} from "../src/ModelRegistry.sol";
import {IOracleConsumer} from "../src/IOracleConsumer.sol";

/// Simulates a v2 logic drop: same storage layout, one new function - proves
/// upgradeToAndCall swaps behavior while the proxy keeps address + state.
contract OracleCoordinatorV2Mock is OracleCoordinator {
    function version() external pure returns (uint256) {
        return 2;
    }
}

contract MockConsumer is IOracleConsumer {
    bytes public lastOutput;
    uint256 public lastRequestId;
    uint256 public calls;

    function onOracleResult(uint256 requestId, bytes calldata output) external {
        lastRequestId = requestId;
        lastOutput = output;
        calls++;
    }
}

contract RevertingConsumer is IOracleConsumer {
    function onOracleResult(uint256, bytes calldata) external pure {
        revert("consumer boom");
    }
}

// A contract whose receive() can be toggled to reject bare BOT transfers -
// exercises the push-then-pull settlement fallback.
contract NonReceiver {
    OracleCoordinator public c;
    bool public acceptEth;

    constructor(address _c) {
        c = OracleCoordinator(_c);
    }

    function setAccept(bool v) external {
        acceptEth = v;
    }

    function request(bytes32 m, uint256 v) external {
        c.request{value: v}(m, "x", address(0), 0);
    }

    function challengeIt(uint256 id, uint256 bond) external {
        c.challenge{value: bond}(id);
    }

    function claim() external {
        c.withdraw();
    }

    receive() external payable {
        require(acceptEth, "no eth thanks");
    }
}

contract OracleCoordinatorTest is Test {
    OracleCoordinator coordinator;
    OperatorRegistry operators;
    ModelRegistry models;

    address treasury = makeAddr("treasury");
    address operator = makeAddr("operator");
    address alice = makeAddr("alice");
    address challenger = makeAddr("challenger");

    bytes32 constant MODEL = keccak256("openai:gpt-4o-mini");
    uint256 constant PRICE = 0.01 ether;
    uint16 constant CUT_BPS = 1000; // 10%
    uint64 constant TIMEOUT = 1 hours;
    uint64 constant CHALLENGE_WINDOW = 1 days;
    uint256 constant BOND = 0.05 ether;
    uint256 constant MIN_STAKE = 1 ether;

    function setUp() public {
        models = ModelRegistry(address(new ERC1967Proxy(
            address(new ModelRegistry()),
            abi.encodeCall(ModelRegistry.initialize, (address(this)))
        )));
        operators = OperatorRegistry(address(new ERC1967Proxy(
            address(new OperatorRegistry()),
            abi.encodeCall(OperatorRegistry.initialize, (address(this), MIN_STAKE, 3 days))
        )));
        coordinator = OracleCoordinator(address(new ERC1967Proxy(
            address(new OracleCoordinator()),
            abi.encodeCall(OracleCoordinator.initialize, (
                address(this), address(models), address(operators), treasury, CUT_BPS, TIMEOUT, CHALLENGE_WINDOW, BOND
            ))
        )));
        models.setModel(MODEL, PRICE, keccak256("image-v1"), "openai:gpt-4o-mini", true);
        operators.setSlasher(address(coordinator));
        vm.deal(operator, 10 ether);
        vm.prank(operator);
        operators.register{value: MIN_STAKE}("https://node.example");
        vm.deal(alice, 10 ether);
        vm.deal(challenger, 10 ether);
    }

    function _request(address consumer) internal returns (uint256) {
        vm.prank(alice);
        return coordinator.request{value: PRICE}(
            MODEL, abi.encode("what is the price of BOT?"), consumer, 300_000
        );
    }

    function test_requestEscrowsFee() public {
        uint256 balBefore = address(coordinator).balance;
        uint256 id = _request(address(0));
        assertEq(address(coordinator).balance, balBefore + PRICE);
        (address requester,,,,,,,, OracleCoordinator.Status status,,,) = coordinator.requests(id);
        assertEq(requester, alice);
        assertEq(uint256(status), uint256(OracleCoordinator.Status.Pending));
    }

    function test_requestRevertsOnWrongFee() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OracleCoordinator.WrongFee.selector, PRICE - 1, PRICE));
        coordinator.request{value: PRICE - 1}(MODEL, "x", address(0), 0);
    }

    function test_fulfillPaysOperatorAndCallsConsumer() public {
        MockConsumer consumer = new MockConsumer();
        uint256 id = _request(address(consumer));
        uint256 opBefore = operator.balance;

        bytes memory output = abi.encode("BOT trades at 12.34 USD");
        vm.prank(operator);
        coordinator.fulfill(id, output);

        assertEq(consumer.calls(), 1);
        assertEq(consumer.lastRequestId(), id);
        assertEq(consumer.lastOutput(), output);
        assertEq(operator.balance, opBefore + PRICE * (10_000 - CUT_BPS) / 10_000);
        assertEq(coordinator.accruedProtocolFees(), PRICE * CUT_BPS / 10_000);
    }

    function test_fulfillRevertsForNonOperator() public {
        uint256 id = _request(address(0));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OracleCoordinator.NotAnOperator.selector, alice));
        coordinator.fulfill(id, "x");
    }

    function test_revertingCallbackDoesNotBlockFulfill() public {
        RevertingConsumer bad = new RevertingConsumer();
        uint256 id = _request(address(bad));
        vm.prank(operator);
        vm.expectEmit(true, false, false, true);
        emit OracleCoordinator.CallbackResult(id, false);
        coordinator.fulfill(id, "x");
        (,,,,,,,, OracleCoordinator.Status status,,,) = _req(id);
        assertEq(uint256(status), uint256(OracleCoordinator.Status.Fulfilled));
    }

    function test_timeoutRefund() public {
        uint256 id = _request(address(0));
        vm.warp(block.timestamp + TIMEOUT + 1);
        uint256 aliceBefore = alice.balance;
        coordinator.refundIfTimedOut(id);
        assertEq(alice.balance, aliceBefore + PRICE);
    }

    function test_refundRevertsBeforeTimeout() public {
        uint256 id = _request(address(0));
        vm.expectRevert(abi.encodeWithSelector(OracleCoordinator.NotTimedOut.selector, id));
        coordinator.refundIfTimedOut(id);
    }

    function test_challengeAndResolveChallengerWins() public {
        uint256 id = _request(address(0));
        vm.prank(operator);
        coordinator.fulfill(id, "x");

        vm.prank(challenger);
        coordinator.challenge{value: BOND}(id);

        uint256 aliceBefore = alice.balance;
        uint256 chalBefore = challenger.balance;
        coordinator.resolveChallenge(id, true);
        // operator stake covers requester refund + bounty; bond returned
        assertEq(alice.balance, aliceBefore + PRICE);
        assertEq(challenger.balance, chalBefore + BOND /*bond*/ + BOND /*bounty*/);
    }

    function test_challengeAndResolveChallengerLoses() public {
        uint256 id = _request(address(0));
        vm.prank(operator);
        coordinator.fulfill(id, "x");
        vm.prank(challenger);
        coordinator.challenge{value: BOND}(id);

        coordinator.resolveChallenge(id, false);
        assertEq(coordinator.accruedProtocolFees(), PRICE * CUT_BPS / 10_000 + BOND);
    }

    function test_challengeRevertsAfterWindow() public {
        uint256 id = _request(address(0));
        vm.prank(operator);
        coordinator.fulfill(id, "x");
        vm.warp(block.timestamp + CHALLENGE_WINDOW + 1);
        vm.prank(challenger);
        vm.expectRevert(abi.encodeWithSelector(OracleCoordinator.ChallengeWindowClosed.selector, id));
        coordinator.challenge{value: BOND}(id);
    }

    function test_callbackGasAboveMaxReverts() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(OracleCoordinator.CallbackGasTooHigh.selector, 2_000_000, 1_000_000)
        );
        coordinator.request{value: PRICE}(MODEL, "x", makeAddr("cb"), 2_000_000);
    }

    function test_refundToNonReceiverCreditsWithdrawable() public {
        NonReceiver nr = new NonReceiver(address(coordinator));
        vm.deal(address(nr), PRICE);
        nr.request(MODEL, PRICE);
        uint256 id = coordinator.nextRequestId() - 1;

        vm.warp(block.timestamp + TIMEOUT + 1);
        coordinator.refundIfTimedOut(id);
        assertEq(coordinator.withdrawable(address(nr)), PRICE);

        nr.setAccept(true);
        uint256 balBefore = address(nr).balance;
        nr.claim();
        assertEq(address(nr).balance, balBefore + PRICE);
        assertEq(coordinator.withdrawable(address(nr)), 0);
    }

    function test_resolveChallengeSurvivesDrainedStake() public {
        uint256 id = _request(address(0));
        vm.prank(operator);
        coordinator.fulfill(id, "x");
        // Drain stake below fee + bond so the second slash hits a zero balance -
        // on the old code this reverted NotAnOperator and bricked resolution.
        operators.slash(operator, MIN_STAKE - 0.005 ether, treasury);
        vm.prank(challenger);
        coordinator.challenge{value: BOND}(id);
        uint256 chalBefore = challenger.balance;
        coordinator.resolveChallenge(id, true);
        (,,,,,,,, OracleCoordinator.Status status,,,) = _req(id);
        assertEq(uint256(status), uint256(OracleCoordinator.Status.Resolved));
        assertEq(challenger.balance, chalBefore + BOND); // bond back; bounty was 0 (stake empty)
    }

    function test_challengerBondReturnFailureStillResolves() public {
        NonReceiver nr = new NonReceiver(address(coordinator));
        vm.deal(address(nr), BOND);
        uint256 id = _request(address(0));
        vm.prank(operator);
        coordinator.fulfill(id, "x");
        nr.challengeIt(id, BOND);
        coordinator.resolveChallenge(id, true);
        // registry-side bounty credit + coordinator-side bond return both fell
        // back to withdrawable for the non-receiving challenger contract.
        assertEq(coordinator.withdrawable(address(nr)), BOND);
        assertEq(operators.withdrawable(address(nr)), BOND);
        (,,,,,,,, OracleCoordinator.Status status,,,) = _req(id);
        assertEq(uint256(status), uint256(OracleCoordinator.Status.Resolved));
    }

    function test_reRegisterDoesNotDoubleCount() public {
        vm.startPrank(operator);
        operators.requestUnstake();
        vm.warp(block.timestamp + 3 days + 1);
        operators.withdrawStake();
        operators.register{value: MIN_STAKE}("https://node.example");
        vm.stopPrank();
        assertEq(operators.operatorCount(), 1);
        assertTrue(operators.isActiveOperator(operator));
    }

    function test_protocolFeeBpsCappedAt20() public {
        coordinator.setProtocolFeeBps(2_000);
        vm.expectRevert("bps > 20%");
        coordinator.setProtocolFeeBps(2_001);
    }

    function test_treasuryWithdraw() public {
        uint256 id = _request(address(0));
        vm.prank(operator);
        coordinator.fulfill(id, "x");
        uint256 tBefore = treasury.balance;
        coordinator.withdrawTreasury();
        assertEq(treasury.balance, tBefore + PRICE * CUT_BPS / 10_000);
    }

    function test_upgradePreservesStateAndAddress() public {
        uint256 id = _request(address(0));
        vm.prank(operator);
        coordinator.fulfill(id, "x");
        uint256 fees = coordinator.accruedProtocolFees();
        address proxy = address(coordinator);

        coordinator.upgradeToAndCall(address(new OracleCoordinatorV2Mock()), "");

        assertEq(address(coordinator), proxy);
        (address requester,,,,,,,, OracleCoordinator.Status status,,,) = coordinator.requests(id);
        assertEq(requester, alice);
        assertEq(uint256(status), uint256(OracleCoordinator.Status.Fulfilled));
        assertEq(coordinator.accruedProtocolFees(), fees);
        // New logic is live at the same address.
        assertEq(OracleCoordinatorV2Mock(proxy).version(), 2);
    }

    function test_upgradeRevertsForNonOwner() public {
        OracleCoordinatorV2Mock v2 = new OracleCoordinatorV2Mock();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, alice));
        coordinator.upgradeToAndCall(address(v2), "");
    }

    function test_cannotReinitializeProxyOrImpl() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        coordinator.initialize(
            address(this), address(models), address(operators), treasury, CUT_BPS, TIMEOUT, CHALLENGE_WINDOW, BOND
        );
        // And the bare implementation is locked too - no takeover via init.
        OracleCoordinator impl = new OracleCoordinator();
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        impl.initialize(
            address(this), address(models), address(operators), treasury, CUT_BPS, TIMEOUT, CHALLENGE_WINDOW, BOND
        );
    }

    // helper: struct-free read of status
    function _req(uint256 id)
        internal
        view
        returns (
            address requester,
            bytes32 modelId,
            bytes32 inputHash,
            uint256 fee,
            address callbackContract,
            uint64 callbackGasLimit,
            uint64 createdAt,
            uint64 fulfilledAt,
            OracleCoordinator.Status status,
            bytes32 outputHash,
            address operator_,
            address chal
        )
    {
        return coordinator.requests(id);
    }
}
