// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./helpers/Base.t.sol";
import {RatingRegistry} from "../src/RatingRegistry.sol";

contract RatingRegistrySubmitTest is Base {
    bytes32 internal constant JOB = keccak256("job-1");

    event RatingSubmitted(
        bytes32 indexed jobId, address indexed worker, address indexed client, uint32 platformId, uint8 score
    );

    function test_submit_storesTheRating() public {
        RatingRegistry.Attestation memory att = attestation(JOB, worker, client, 1);
        bytes32 contentHash = keccak256("delivered on time");
        bytes memory sig = sign(att, platformKey);

        vm.prank(client);
        ratings.submitRating(att, sig, 5, contentHash);

        RatingRegistry.Rating memory stored = ratings.ratingOf(JOB);
        assertEq(stored.worker, worker);
        assertEq(stored.client, client);
        assertEq(stored.platformId, platformId);
        assertEq(stored.score, 5);
        assertEq(stored.submittedAt, uint64(block.timestamp));
        assertEq(stored.contentHash, contentHash);
    }

    function test_submit_bumpsWorkerStatsAndMovesTheScore() public {
        assertEq(ratings.scoreOf(worker), 30_000);

        RatingRegistry.Attestation memory att = attestation(JOB, worker, client, 1);
        bytes memory sig = sign(att, platformKey);
        vm.prank(client);
        ratings.submitRating(att, sig, 5, bytes32(0));

        (, uint32 count, uint32 sum) = workers.statsOf(worker);
        assertEq(count, 1);
        assertEq(sum, 5);
        assertEq(ratings.scoreOf(worker), 33_333, "one 5-star reads as unproven, not perfect");
    }

    function test_submit_emitsTheEvent() public {
        RatingRegistry.Attestation memory att = attestation(JOB, worker, client, 1);
        bytes memory sig = sign(att, platformKey);

        vm.expectEmit(true, true, true, true);
        emit RatingSubmitted(JOB, worker, client, platformId, 4);

        vm.prank(client);
        ratings.submitRating(att, sig, 4, bytes32(0));
    }

    function test_submit_marksTheNonceSpent() public {
        assertFalse(ratings.nonceUsed(platformId, 7));

        RatingRegistry.Attestation memory att = attestation(JOB, worker, client, 7);
        bytes memory sig = sign(att, platformKey);
        vm.prank(client);
        ratings.submitRating(att, sig, 5, bytes32(0));

        assertTrue(ratings.nonceUsed(platformId, 7));
    }

    function test_submit_acceptsAZeroContentHashForNoComment() public {
        RatingRegistry.Attestation memory att = attestation(JOB, worker, client, 1);
        bytes memory sig = sign(att, platformKey);
        vm.prank(client);
        ratings.submitRating(att, sig, 3, bytes32(0));

        assertEq(ratings.ratingOf(JOB).contentHash, bytes32(0));
    }

    function test_submit_manyJobsAccumulate() public {
        uint8[5] memory scores = [5, 4, 5, 3, 5];

        for (uint256 i = 0; i < scores.length; i++) {
            RatingRegistry.Attestation memory att =
                attestation(keccak256(abi.encode("job", i)), worker, client, i + 1);
            bytes memory sig = sign(att, platformKey);
            vm.prank(client);
            ratings.submitRating(att, sig, scores[i], bytes32(0));
        }

        (, uint32 count, uint32 sum) = workers.statsOf(worker);
        assertEq(count, 5);
        assertEq(sum, 22);
        // (220000 + 150000) / 10 = 37000
        assertEq(ratings.scoreOf(worker), 37_000);
    }

    function test_submit_acceptsCompletedAtExactlyNow() public {
        RatingRegistry.Attestation memory att = attestation(JOB, worker, client, 1);
        att.completedAt = uint64(block.timestamp);
        bytes memory sig = sign(att, platformKey);

        vm.prank(client);
        ratings.submitRating(att, sig, 5, bytes32(0));

        assertEq(ratings.ratingOf(JOB).score, 5);
    }

    function testFuzz_anyValidScoreIsStoredExactly(uint8 rawScore, bytes32 jobId, bytes32 contentHash)
        public
    {
        uint8 score = uint8(bound(uint256(rawScore), 1, 5));

        RatingRegistry.Attestation memory att = attestation(jobId, worker, client, 1);
        bytes memory sig = sign(att, platformKey);
        vm.prank(client);
        ratings.submitRating(att, sig, score, contentHash);

        RatingRegistry.Rating memory stored = ratings.ratingOf(jobId);
        assertEq(stored.score, score);
        assertEq(stored.contentHash, contentHash);

        (, uint32 count, uint32 sum) = workers.statsOf(worker);
        assertEq(count, 1);
        assertEq(sum, score);
    }

    function test_gas_submitRatingRegressionGuard() public {
        RatingRegistry.Attestation memory att = attestation(JOB, worker, client, 1);
        bytes memory sig = sign(att, platformKey);

        vm.prank(client);
        uint256 before = gasleft();
        ratings.submitRating(att, sig, 5, keccak256("comment"));
        uint256 used = before - gasleft();

        emit log_named_uint("submitRating gas", used);
        // This is a gasleft() delta measured from the test contract, so it includes
        // ~5k of vm.prank bookkeeping and CALL frame overhead that submitRating()
        // never pays. `forge test --gas-report` puts submitRating at 145,190 max,
        // which is the figure docs/CONTRACTS.md's "under 120k" rough target refers
        // to — that target is NOT met. See docs/DECISIONS.md for why it's accepted
        // rather than optimized away. This bound guards against a real regression
        // without re-measuring the harness.
        assertLt(used, 155_000, "submitRating regression guard, gasleft delta including call overhead");
    }
}
