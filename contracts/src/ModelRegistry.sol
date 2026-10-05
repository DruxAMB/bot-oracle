// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Initializable} from "openzeppelin-contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "openzeppelin-contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "openzeppelin-contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @notice Registry of models the oracle will serve, with per-query pricing.
/// Prices are denominated in wei of the native token (BOT) - v1 charges BOT only.
/// USDT-denominated billing arrives with the subscription vault (Phase 2).
/// UUPS-upgradeable: the proxy address is permanent; logic upgrades keep it.
contract ModelRegistry is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    struct Model {
        uint256 priceWei;        // fee escrowed per request
        bytes32 containerHash;   // commitment to the model image/artifact the node runs
        string backend;          // e.g. "openai:gpt-4o-mini", "ollama:llama3.1-8b"
        bool active;
    }

    mapping(bytes32 modelId => Model) public models;

    event ModelSet(bytes32 indexed modelId, uint256 priceWei, bytes32 containerHash, string backend, bool active);

    error ModelNotFound(bytes32 modelId);
    error ModelInactive(bytes32 modelId);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_) external initializer {
        __Ownable_init(owner_);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setModel(
        bytes32 modelId,
        uint256 priceWei,
        bytes32 containerHash,
        string calldata backend,
        bool active
    ) external onlyOwner {
        models[modelId] = Model(priceWei, containerHash, backend, active);
        emit ModelSet(modelId, priceWei, containerHash, backend, active);
    }

    /// @dev Reverts for unknown or inactive models - callers get a clean failure at request time.
    function priceOf(bytes32 modelId) external view returns (uint256) {
        Model memory m = models[modelId];
        if (m.containerHash == bytes32(0)) revert ModelNotFound(modelId);
        if (!m.active) revert ModelInactive(modelId);
        return m.priceWei;
    }

    /// @dev Storage gap - reserve slots so future versions can add state
    /// variables without shifting the layout of inheriting/upgraded code.
    uint256[50] private __gap;
}
