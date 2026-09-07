// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./helpers/Base.t.sol";
import {RatingRegistry} from "../src/RatingRegistry.sol";

/// @dev The scenarios from docs/SECURITY.md, as executable assertions.
contract AttacksTest is Base {
    /// @notice Sybil: 100 fresh addresses try to rate one worker into the top band
    ///         without a platform attestation. All 100 must fail.
    /// @dev Each attacker signs with its own key, which produces a structurally
    ///      valid signature from a signer that is not on the allowlist. That is
    ///      the realistic attack; a malformed signature would revert inside
    ///      ECDSA before reaching our check and would prove nothing.
    function test_sybil_hundredUnattestedRatingsAllRevert() public {
        for (uint256 i = 1; i <= 100; i++) {
            uint256 attackerKey = 0x5EED0000 + i;
            address attacker = vm.addr(attackerKey);

            RatingRegistry.Attestation memory att =
                attestation(keccak256(abi.encode("sybil", i)), worker, attacker, i);
            bytes memory sig = sign(att, attackerKey);

            vm.prank(attacker);
            vm.expectRevert(RatingRegistry.UnknownPlatform.selector);
            ratings.submitRating(att, sig, 5, bytes32(0));
        }

        (, uint32 count, uint32 sum) = workers.statsOf(worker);
        assertEq(count, 0, "no sybil rating may land");
        assertEq(sum, 0);
        assertEq(ratings.scoreOf(worker), 30_000, "score is untouched at the bare prior");
    }

    /// @notice Sybil with a stolen key: if a platform signing key leaks, the
    ///         defense collapses. docs/SECURITY.md calls this out as residual
    ///         risk; this test pins that it really is the whole trust boundary.
    function test_sybil_residualRisk_compromisedPlatformKeySucceeds() public {
        for (uint256 i = 1; i <= 10; i++) {
            address attacker = vm.addr(0x51150000 + i);
            RatingRegistry.Attestation memory att =
                attestation(keccak256(abi.encode("stolen", i)), worker, attacker, i);
            bytes memory sig = sign(att, platformKey);

            vm.prank(attacker);
            ratings.submitRating(att, sig, 5, bytes32(0));
        }

        (, uint32 count,) = workers.statsOf(worker);
        assertEq(count, 10, "a leaked platform key defeats the allowlist entirely");
        assertGt(ratings.scoreOf(worker), 40_000);
    }

    /// @notice Whitewashing, the case the prior actually defends: a worker above
    ///         the 3.00 prior loses by abandoning their address.
    function test_whitewashing_costsAWorkerAboveThePrior() public {
        for (uint256 i = 1; i <= 20; i++) {
            RatingRegistry.Attestation memory att =
                attestation(keccak256(abi.encode("good", i)), worker, client, i);
            bytes memory sig = sign(att, platformKey);
            vm.prank(client);
            ratings.submitRating(att, sig, 5, bytes32(0));
        }

        uint256 established = ratings.scoreOf(worker);
        assertEq(established, 46_000, "20 five-star jobs read as 4.60");

        address freshAddress = address(0x3333);
        registerWorker(freshAddress);
        uint256 afterReset = ratings.scoreOf(freshAddress);

        assertEq(afterReset, 30_000);
        assertLt(afterReset, established, "abandoning a good history must cost the worker");
    }

    /// @notice Whitewashing residual risk, stated plainly in docs/SECURITY.md:
    ///         a worker sitting below the prior still gains by resetting.
    /// @dev docs/CONTRACTS.md asks for the opposite assertion. It is wrong; making
    ///      it true would need a different scoring formula, which is the project
    ///      owner's decision. This test pins the real behaviour so the gap cannot
    ///      be quietly forgotten.
    function test_whitewashing_lowRatedWorkerStillGains() public {
        for (uint256 i = 1; i <= 50; i++) {
            RatingRegistry.Attestation memory att =
                attestation(keccak256(abi.encode("bad", i)), worker, client, i);
            bytes memory sig = sign(att, platformKey);
            vm.prank(client);
            ratings.submitRating(att, sig, 2, bytes32(0));
        }

        uint256 badHistory = ratings.scoreOf(worker);
        assertEq(badHistory, 20_909, "50 two-star jobs read as 2.09");

        address freshAddress = address(0x4444);
        registerWorker(freshAddress);

        assertGt(
            ratings.scoreOf(freshAddress),
            badHistory,
            "KNOWN LIMIT: a worker below the prior gains by resetting. Closing this "
            "needs one-account-per-person, which needs identity binding or a "
            "zero-knowledge uniqueness proof. Out of scope; stated in the README."
        );

        (, uint32 count,) = workers.statsOf(freshAddress);
        assertEq(count, 0, "but the fresh profile has no jobs, and the UI marks it unproven");
    }

    /// @notice Signature replay: the same attestation submitted twice.
    function test_replay_sameAttestationTwice() public {
        RatingRegistry.Attestation memory att = attestation(keccak256("job-x"), worker, client, 1);
        bytes memory sig = sign(att, platformKey);

        vm.prank(client);
        ratings.submitRating(att, sig, 5, bytes32(0));

        vm.prank(client);
        vm.expectRevert(RatingRegistry.JobAlreadyRated.selector);
        ratings.submitRating(att, sig, 5, bytes32(0));

        (, uint32 count,) = workers.statsOf(worker);
        assertEq(count, 1, "a replayed attestation must not inflate the count");
    }

    /// @notice Signature replay in bulk: 50 attempts to reuse one attestation.
    function test_replay_fiftyAttemptsAllRevert() public {
        RatingRegistry.Attestation memory att = attestation(keccak256("job-y"), worker, client, 1);
        bytes memory sig = sign(att, platformKey);

        vm.prank(client);
        ratings.submitRating(att, sig, 5, bytes32(0));

        for (uint256 i = 0; i < 50; i++) {
            vm.prank(client);
            vm.expectRevert(RatingRegistry.JobAlreadyRated.selector);
            ratings.submitRating(att, sig, 5, bytes32(0));
        }

        (, uint32 count,) = workers.statsOf(worker);
        assertEq(count, 1);
    }

    /// @notice A deactivated platform's signature stops working.
    function test_deactivatedPlatformSignatureIsRejected() public {
        RatingRegistry.Attestation memory before_ = attestation(keccak256("job-before"), worker, client, 1);
        bytes memory sigBefore = sign(before_, platformKey);
        vm.prank(client);
        ratings.submitRating(before_, sigBefore, 5, bytes32(0));

        vm.prank(owner);
        platforms.deactivatePlatform(platformId);

        RatingRegistry.Attestation memory after_ = attestation(keccak256("job-after"), worker, client, 2);
        bytes memory sigAfter = sign(after_, platformKey);
        vm.prank(client);
        vm.expectRevert(RatingRegistry.UnknownPlatform.selector);
        ratings.submitRating(after_, sigAfter, 5, bytes32(0));

        assertEq(
            ratings.ratingOf(keccak256("job-before")).score, 5, "ratings from before deactivation stay valid"
        );
    }

    /// @notice Cross-chain replay: a signature made for a different chain id is
    ///         rejected, because the chain id sits in the EIP-712 domain separator.
    function test_crossChainReplayIsRejected() public {
        RatingRegistry.Attestation memory att = attestation(keccak256("job-z"), worker, client, 1);

        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Attestation(bytes32 jobId,address worker,address client,uint64 completedAt,uint256 nonce)"
                ),
                att.jobId,
                att.worker,
                att.client,
                att.completedAt,
                att.nonce
            )
        );

        bytes32 foreignDomain = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("PortaRep")),
                keccak256(bytes("1")),
                block.chainid + 1,
                address(ratings)
            )
        );

        bytes32 foreignDigest = keccak256(abi.encodePacked(hex"1901", foreignDomain, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(platformKey, foreignDigest);

        vm.prank(client);
        vm.expectRevert(RatingRegistry.UnknownPlatform.selector);
        ratings.submitRating(att, abi.encodePacked(r, s, v), 5, bytes32(0));

        assertTrue(foreignDigest != ratings.attestationDigest(att), "domains must differ by chain id alone");
    }

    /// @notice Replay onto a different deployment of the same contract on the
    ///         same chain, blocked by verifyingContract in the domain separator.
    function test_replayOntoADifferentDeploymentIsRejected() public {
        RatingRegistry other = new RatingRegistry(workers, platforms, 30_000, 5);

        RatingRegistry.Attestation memory att = attestation(keccak256("job-w"), worker, client, 1);
        bytes memory sigForOriginal = sign(att, platformKey);

        vm.prank(client);
        vm.expectRevert(RatingRegistry.UnknownPlatform.selector);
        other.submitRating(att, sigForOriginal, 5, bytes32(0));
    }

    /// @notice Bad-mouthing: one low rating is visible rather than hidden inside
    ///         an average, which is what the profile's distribution view is for.
    function test_badMouthing_oneLowRatingCannotSinkAnEstablishedProfile() public {
        for (uint256 i = 1; i <= 30; i++) {
            RatingRegistry.Attestation memory att =
                attestation(keccak256(abi.encode("solid", i)), worker, client, i);
            bytes memory sig = sign(att, platformKey);
            vm.prank(client);
            ratings.submitRating(att, sig, 5, bytes32(0));
        }

        uint256 before = ratings.scoreOf(worker);

        address competitor = address(0x6666);
        RatingRegistry.Attestation memory attack = attestation(keccak256("attack"), worker, competitor, 999);
        bytes memory attackSig = sign(attack, platformKey);
        vm.prank(competitor);
        ratings.submitRating(attack, attackSig, 1, bytes32(0));

        uint256 after_ = ratings.scoreOf(worker);

        assertLt(after_, before);
        assertGt(after_, 44_000, "30 five-star jobs absorb one 1-star without collapsing");
    }

    /// @notice Pins the runtime half of docs/SECURITY.md's "Score inflation
    ///         through the owner key" mitigation: driving every reachable
    ///         state-changing entry point in the system once does not move
    ///         `PRIOR_SCORE_BPS` or `PRIOR_WEIGHT`, and the scoring formula
    ///         still runs on exactly those two values afterward.
    /// @dev `immutable` is a compile-time guarantee, not a runtime property —
    ///      the compiler refuses to emit any code path that writes these slots
    ///      after construction, so no call this test could make would ever
    ///      observe a violation even if one existed. What this test can and
    ///      does establish is narrower: that no *reachable* function anywhere
    ///      in PlatformRegistry, WorkerRegistry, or RatingRegistry mutates the
    ///      priors, by calling one of each kind (platform onboarding, platform
    ///      deactivation, worker registration, a full rating submission) and
    ///      then reading the priors and the formula's inputs back unchanged.
    ///      That is the evidence a reader of docs/SECURITY.md would actually
    ///      want behind "Constants are immutable, set in the constructor. The
    ///      owner cannot touch them."
    function test_scoringConstantsSurviveEveryReachableStateChange() public {
        // Owner registers an additional platform.
        uint256 secondPlatformKey = 0xF00DBABE;
        address secondPlatformSigner = vm.addr(secondPlatformKey);
        vm.prank(owner);
        uint32 secondPlatformId =
            platforms.registerPlatform(secondPlatformSigner, keccak256("SecondPlatform"));

        // Owner deactivates a platform (the freshly added one, so the original
        // platform stays active for the rating submitted below).
        vm.prank(owner);
        platforms.deactivatePlatform(secondPlatformId);

        // A new worker registers.
        address newWorker = address(0x7777);
        registerWorker(newWorker);

        // A rating is submitted end to end: writes rating storage and bumps
        // worker stats, the two state changes closest to the scoring formula.
        RatingRegistry.Attestation memory att = attestation(keccak256("job-priors"), worker, client, 1);
        bytes memory sig = sign(att, platformKey);
        vm.prank(client);
        ratings.submitRating(att, sig, 5, bytes32(0));

        // These two selectors are the only plausible names a prior-rewriting
        // setter would carry. A `false` result only shows that no function
        // exists under exactly these two names and signatures on this
        // contract with no fallback — it says nothing about a setter under a
        // different name (e.g. `updatePriors(uint256,uint32)`), and unlike the
        // checks above it cannot exercise `immutable` at all.
        bytes4[2] memory guessedSetterSelectors =
            [bytes4(keccak256("setPriorScoreBps(uint256)")), bytes4(keccak256("setPriorWeight(uint32)"))];
        for (uint256 i = 0; i < guessedSetterSelectors.length; i++) {
            vm.prank(owner);
            (bool ok,) =
                address(ratings).call(abi.encodeWithSelector(guessedSetterSelectors[i], uint256(50_000)));
            assertFalse(ok, "no setter exists under this guessed selector, for what that is worth");
        }

        assertEq(ratings.PRIOR_SCORE_BPS(), 30_000, "prior score bps unchanged after every reachable write");
        assertEq(ratings.PRIOR_WEIGHT(), 5, "prior weight unchanged after every reachable write");

        (, uint32 ratingCount, uint32 scoreSum) = workers.statsOf(worker);
        assertEq(
            ratings.scoreOf(worker),
            ratings.previewScoreBps(ratingCount, scoreSum),
            "scoreOf still runs the formula on the constructor's own constants"
        );
    }
}
