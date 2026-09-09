// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeployScript} from "../script/Deploy.s.sol";
import {PlatformRegistry} from "../src/PlatformRegistry.sol";
import {WorkerRegistry} from "../src/WorkerRegistry.sol";
import {RatingRegistry} from "../src/RatingRegistry.sol";

contract DeployTest is Test {
    function test_deploy_wiresRatingRegistryIntoWorkerRegistry() public {
        DeployScript script = new DeployScript();
        (PlatformRegistry platforms, WorkerRegistry workers, RatingRegistry ratings) =
            script.deploy(address(this));

        assertEq(workers.ratingRegistry(), address(ratings), "wiring must land");
        assertEq(address(ratings.WORKERS()), address(workers));
        assertEq(address(ratings.PLATFORMS()), address(platforms));
    }

    function test_deploy_setsTheDocumentedPriorConstants() public {
        DeployScript script = new DeployScript();
        (,, RatingRegistry ratings) = script.deploy(address(this));

        assertEq(ratings.PRIOR_SCORE_BPS(), 30_000, "docs/CONTRACTS.md fixes the prior at 3.00 stars");
        assertEq(ratings.PRIOR_WEIGHT(), 5);
    }

    function test_deploy_ownerCanRegisterAPlatformImmediately() public {
        DeployScript script = new DeployScript();
        (PlatformRegistry platforms,,) = script.deploy(address(this));

        uint32 id = platforms.registerPlatform(address(0xA11CE), keccak256("Kurirku"));
        assertEq(id, 1, "ids start at 1 so 0 means unknown");
        assertTrue(platforms.isActiveSigner(address(0xA11CE)));
    }

    function test_deploy_ratingSubmissionPathIsLiveEndToEnd() public {
        DeployScript script = new DeployScript();
        (PlatformRegistry platforms, WorkerRegistry workers, RatingRegistry ratings) =
            script.deploy(address(this));

        uint256 platformKey = 0xA11CE;
        platforms.registerPlatform(vm.addr(platformKey), keccak256("Kurirku"));

        address worker = address(0x1111);
        address client = address(0x2222);
        vm.prank(worker);
        workers.register();

        RatingRegistry.Attestation memory att = RatingRegistry.Attestation({
            jobId: keccak256("job-1"),
            worker: worker,
            client: client,
            completedAt: uint64(block.timestamp),
            nonce: 1
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(platformKey, ratings.attestationDigest(att));
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.prank(client);
        ratings.submitRating(att, sig, 5, bytes32(0));

        assertEq(ratings.ratingOf(att.jobId).score, 5, "a freshly deployed system must accept a rating");
        assertEq(ratings.scoreOf(worker), 33_333, "one 5-star reads as unproven, not perfect");
    }
}
