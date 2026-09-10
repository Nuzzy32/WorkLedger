// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {PlatformRegistry} from "../src/PlatformRegistry.sol";
import {WorkerRegistry} from "../src/WorkerRegistry.sol";
import {RatingRegistry} from "../src/RatingRegistry.sol";

/// @title DeployScript
/// @notice Deploys the three WorkLedger registries and wires them together.
/// @dev The wiring assertion in `deploy` is mandated by docs/DECISIONS.md entry A:
///      `setRatingRegistry` is write-once, so a skipped or misdirected call leaves a
///      permanently frozen system that only a WorkerRegistry redeploy can fix.
contract DeployScript is Script {
    /// @notice Prior score in basis points, fixed by docs/CONTRACTS.md at 3.00 stars.
    uint256 public constant PRIOR_SCORE_BPS = 30_000;

    /// @notice Prior weight, fixed by docs/CONTRACTS.md.
    uint32 public constant PRIOR_WEIGHT = 5;

    error WiringFailed(address expected, address actual);

    /// @notice Thrown when the target chain is not an allowlisted testnet.
    /// @param chainId The rejected chain id.
    error UnsupportedChain(uint256 chainId);

    /// @notice Deploy and wire all three registries.
    /// @param owner Address that will own the platform allowlist.
    /// @return platforms The deployed PlatformRegistry.
    /// @return workers The deployed WorkerRegistry.
    /// @return ratings The deployed RatingRegistry.
    function deploy(address owner)
        public
        returns (PlatformRegistry platforms, WorkerRegistry workers, RatingRegistry ratings)
    {
        platforms = new PlatformRegistry(owner);
        workers = new WorkerRegistry();
        ratings = new RatingRegistry(workers, platforms, PRIOR_SCORE_BPS, PRIOR_WEIGHT);

        workers.setRatingRegistry(address(ratings));

        // Do not assume the call landed. A frozen system is silent otherwise.
        if (workers.ratingRegistry() != address(ratings)) {
            revert WiringFailed(address(ratings), workers.ratingRegistry());
        }
    }

    /// @notice Entry point for `forge script`. Broadcasts and writes the artifact.
    /// @dev Only chain ids 31337 (anvil) and 84532 (Base Sepolia) are allowlisted;
    ///      this project is testnet-only per CLAUDE.md rule 2.
    function run() external {
        if (block.chainid != 31337 && block.chainid != 84532) {
            revert UnsupportedChain(block.chainid);
        }

        address owner = msg.sender;

        vm.startBroadcast();
        (PlatformRegistry platforms, WorkerRegistry workers, RatingRegistry ratings) = deploy(owner);
        vm.stopBroadcast();

        console.log("PlatformRegistry", address(platforms));
        console.log("WorkerRegistry  ", address(workers));
        console.log("RatingRegistry  ", address(ratings));

        _writeArtifact(address(platforms), address(workers), address(ratings));
    }

    function _writeArtifact(address platforms, address workers, address ratings) private {
        string memory dir = string.concat(vm.projectRoot(), "/deployments");
        string memory path = string.concat(dir, "/", _chainName(), ".json");

        string memory json = "artifact";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeUint(json, "block", block.number);
        vm.serializeAddress(json, "platformRegistry", platforms);
        vm.serializeAddress(json, "workerRegistry", workers);
        string memory out = vm.serializeAddress(json, "ratingRegistry", ratings);

        vm.createDir(dir, true);
        vm.writeJson(out, path);
        console.log("artifact written", path);
    }

    function _chainName() private view returns (string memory) {
        if (block.chainid == 31337) return "anvil";
        if (block.chainid == 84532) return "base-sepolia";
        return vm.toString(block.chainid);
    }
}
