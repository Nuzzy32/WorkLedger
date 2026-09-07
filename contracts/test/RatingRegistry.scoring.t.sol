// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {PlatformRegistry} from "../src/PlatformRegistry.sol";
import {WorkerRegistry} from "../src/WorkerRegistry.sol";
import {RatingRegistry} from "../src/RatingRegistry.sol";

contract RatingRegistryScoringTest is Test {
    PlatformRegistry internal platforms;
    WorkerRegistry internal workers;
    RatingRegistry internal ratings;

    address internal owner = address(0xB0B);
    address internal worker = address(0x1111);

    function setUp() public {
        vm.warp(1_700_000_000);
        platforms = new PlatformRegistry(owner);
        workers = new WorkerRegistry();
        ratings = new RatingRegistry(workers, platforms, 30_000, 5);
        workers.setRatingRegistry(address(ratings));
    }

    function test_immutablesMatchTheSpec() public view {
        assertEq(ratings.PRIOR_SCORE_BPS(), 30_000, "prior score is 3.00 stars");
        assertEq(ratings.PRIOR_WEIGHT(), 5);
        assertEq(address(ratings.WORKERS()), address(workers));
        assertEq(address(ratings.PLATFORMS()), address(platforms));
    }

    /// @dev Values hand-computed from the spec formula. An off-by-one in the
    ///      truncation direction would otherwise ship unnoticed.
    function test_pinnedBasisPoints() public view {
        // (0 + 5*30000) / 5 = 30000
        assertEq(ratings.previewScoreBps(0, 0), 30_000, "fresh account is 3.00");
        // (50000 + 150000) / 6 = 33333.33 -> 33333
        assertEq(ratings.previewScoreBps(1, 5), 33_333, "one 5-star reads unproven, not perfect");
        // (10000 + 150000) / 6 = 26666.67 -> 26666
        assertEq(ratings.previewScoreBps(1, 1), 26_666);
        // (150000 + 150000) / 8 = 37500 exactly
        assertEq(ratings.previewScoreBps(3, 15), 37_500);
        // (500000 + 150000) / 15 = 43333.33 -> 43333
        assertEq(ratings.previewScoreBps(10, 50), 43_333);
        // (1000000 + 150000) / 55 = 20909.09 -> 20909
        assertEq(ratings.previewScoreBps(50, 100), 20_909, "a 2.0 average lands at 2.09");
        // (4600000 + 150000) / 105 = 45238.09 -> 45238
        assertEq(ratings.previewScoreBps(100, 460), 45_238);
    }

    function test_priorPullsAPerfectRecordDownUntilTheCountIsLarge() public view {
        uint256 few = ratings.previewScoreBps(1, 5);
        uint256 many = ratings.previewScoreBps(300, 1500);

        assertLt(few, many, "300 five-star jobs must outrank one");
        assertLt(many, 50_000, "the prior keeps even a perfect record under 5.00");
        assertGt(many, 49_000, "but only just, at 300 jobs");
    }

    function test_scoreOf_readsWorkerStats() public {
        assertEq(ratings.scoreOf(worker), 30_000, "unregistered reads as the bare prior");

        vm.prank(worker);
        workers.register();
        assertEq(ratings.scoreOf(worker), 30_000);

        vm.prank(address(ratings));
        workers.recordRating(worker, 5);
        assertEq(ratings.scoreOf(worker), 33_333);
    }

    function test_revert_constructorRejectsBadPriors() public {
        vm.expectRevert(RatingRegistry.InvalidPrior.selector);
        new RatingRegistry(workers, platforms, 30_000, 0);

        vm.expectRevert(RatingRegistry.InvalidPrior.selector);
        new RatingRegistry(workers, platforms, 9_999, 5);

        vm.expectRevert(RatingRegistry.InvalidPrior.selector);
        new RatingRegistry(workers, platforms, 50_001, 5);
    }

    function test_revert_constructorRejectsZeroRegistries() public {
        vm.expectRevert(RatingRegistry.ZeroAddress.selector);
        new RatingRegistry(WorkerRegistry(address(0)), platforms, 30_000, 5);

        vm.expectRevert(RatingRegistry.ZeroAddress.selector);
        new RatingRegistry(workers, PlatformRegistry(address(0)), 30_000, 5);
    }

    function testFuzz_scoreAlwaysWithinOneToFiveStars(uint32 count, uint32 sum) public view {
        count = uint32(bound(uint256(count), 0, 1_000_000));
        sum = uint32(bound(uint256(sum), count, uint256(count) * 5));

        uint256 score = ratings.previewScoreBps(count, sum);

        assertGe(score, 10_000, "score can never fall below 1.00 stars");
        assertLe(score, 50_000, "score can never exceed 5.00 stars");
    }

    function testFuzz_oneMoreFiveStarNeverLowersTheScore(uint32 count) public view {
        count = uint32(bound(uint256(count), 0, 100_000));
        uint32 sum = count * 4;

        uint256 before = ratings.previewScoreBps(count, sum);
        uint256 after_ = ratings.previewScoreBps(count + 1, sum + 5);

        assertGe(after_, before, "a 5-star job must never reduce a 4.00 average");
    }

    function testFuzz_domainSeparatorIsBoundToThisChain(uint64 otherChainId) public {
        vm.assume(otherChainId != block.chainid && otherChainId != 0);

        (,,, uint256 chainId, address verifyingContract,,) = ratings.eip712Domain();
        assertEq(chainId, block.chainid, "chain id must sit in the domain separator");
        assertEq(verifyingContract, address(ratings));
        assertTrue(chainId != otherChainId);
    }
}
