// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "openzeppelin-contracts/access/Ownable.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/utils/ReentrancyGuard.sol";

/// @notice Operator staking registry for oracle nodes.
/// v1 runs a single operator (us); the registry already carries the stake/slash/
/// unbonding machinery so v2 can open registration without a contract migration.
/// Trust model is documented honestly: operators are slashable by the arbitrator
/// (owner for v1), NOT by trustless fraud proofs - that's the roadmap.
contract OperatorRegistry is Ownable, ReentrancyGuard {
    struct Operator {
        uint256 stake;
        uint256 unstakeRequestedAt; // 0 = not unstaking
        string nodeEndpoint;        // informational: where the node's gateway lives
    }

    uint256 public minStake;
    uint256 public unbondingPeriod;
    /// @notice Contract authorized to slash (the dispute-resolution coordinator).
    /// Settable by owner; keeps slashing power out of EOAs and inside the
    /// protocol's own resolution path.
    address public slasher;

    mapping(address => Operator) public operators;
    address[] public operatorList;

    event OperatorRegistered(address indexed operator, uint256 stake, string nodeEndpoint);
    event UnstakeRequested(address indexed operator, uint256 availableAt);
    event OperatorWithdrawn(address indexed operator, uint256 amount);
    event OperatorSlashed(address indexed operator, uint256 amount, address indexed to);

    error StakeBelowMinimum(uint256 sent, uint256 required);
    error NotAnOperator(address operator);
    error UnbondingNotElapsed(uint256 availableAt);
    error AlreadyRegistered(address operator);

    constructor(uint256 minStake_, uint256 unbondingPeriod_) Ownable(msg.sender) {
        minStake = minStake_;
        unbondingPeriod = unbondingPeriod_;
    }

    function register(string calldata nodeEndpoint) external payable {
        if (msg.value < minStake) revert StakeBelowMinimum(msg.value, minStake);
        Operator storage op = operators[msg.sender];
        if (op.stake > 0) revert AlreadyRegistered(msg.sender);
        op.stake = msg.value;
        op.unstakeRequestedAt = 0; // cleared on re-register after a withdrawal
        op.nodeEndpoint = nodeEndpoint;
        operatorList.push(msg.sender);
        emit OperatorRegistered(msg.sender, msg.value, nodeEndpoint);
    }

    function isActiveOperator(address a) external view returns (bool) {
        return operators[a].stake >= minStake && operators[a].unstakeRequestedAt == 0;
    }

    /// @notice Begin unbonding - operator stops being active immediately, stake
    /// becomes withdrawable after unbondingPeriod.
    function requestUnstake() external {
        Operator storage op = operators[msg.sender];
        if (op.stake == 0) revert NotAnOperator(msg.sender);
        op.unstakeRequestedAt = block.timestamp;
        emit UnstakeRequested(msg.sender, block.timestamp + unbondingPeriod);
    }

    function withdrawStake() external nonReentrant {
        Operator storage op = operators[msg.sender];
        if (op.stake == 0) revert NotAnOperator(msg.sender);
        uint256 at = op.unstakeRequestedAt;
        if (at == 0 || block.timestamp < at + unbondingPeriod) revert UnbondingNotElapsed(at + unbondingPeriod);
        uint256 amount = op.stake;
        op.stake = 0;
        emit OperatorWithdrawn(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "withdraw failed");
    }

    function setSlasher(address s) external onlyOwner {
        slasher = s;
    }

    /// @notice Slash an operator's stake; sends the slashed amount to `to`
    /// (arbitrator decides destination - challenger bounty, requester refund, treasury).
    /// Callable by owner or the authorized slasher contract.
    function slash(address operator, uint256 amount, address to) external nonReentrant {
        require(msg.sender == owner() || msg.sender == slasher, "not slasher");
        Operator storage op = operators[operator];
        if (op.stake == 0) revert NotAnOperator(operator);
        if (amount > op.stake) amount = op.stake;
        op.stake -= amount;
        emit OperatorSlashed(operator, amount, to);
        if (amount > 0) {
            (bool ok,) = to.call{value: amount}("");
            require(ok, "slash transfer failed");
        }
    }

    function operatorCount() external view returns (uint256) {
        return operatorList.length;
    }
}
