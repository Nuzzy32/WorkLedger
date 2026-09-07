// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./helpers/Base.t.sol";
import {RatingRegistry} from "../src/RatingRegistry.sol";

contract RatingRegistryRevertsTest is Base {
    bytes32 internal constant JOB = keccak256("job-1");

    function test_revert_scoreZero() public {
        RatingRegistry.Attestation memory att = attestation(JOB, worker, client, 1);
        bytes memory sig = sign(att, platformKey);

        vm.prank(client);
        vm.expectRevert(RatingRegistry.InvalidScore.selector);
        ratings.submitRating(att, sig, 0, bytes32(0));
    }

    function test_revert_scoreAboveFive() public {
        RatingRegistry.Attestation memory att = attestation(JOB, worker, client, 1);
        bytes memory sig = sign(att, platformKey);

        vm.prank(client);
        vm.expectRevert(RatingRegistry.InvalidScore.selector);
        ratings.submitRating(att, sig, 6, bytes32(0));
    }

    function test_revert_jobAlreadyRated() public {
        RatingRegistry.Attestation memory att = attestation(JOB, worker, client, 1);
        bytes memory sig = sign(att, platformKey);

        vm.prank(client);
        ratings.submitRating(att, sig, 5, bytes32(0));

        vm.prank(client);
        vm.expectRevert(RatingRegistry.JobAlreadyRated.selector);
        ratings.submitRating(att, sig, 5, bytes32(0));
    }

    function test_revert_senderIsNotTheClient() public {
        RatingRegistry.Attestation memory att = attestation(JOB, worker, client, 1);
        bytes memory sig = sign(att, platformKey);

        vm.prank(address(0xDEAD));
        vm.expectRevert(RatingRegistry.NotTheClient.selector);
        ratings.submitRating(att, sig, 5, bytes32(0));
    }

    function test_revert_selfRating() public {
        RatingRegistry.Attestation memory att = attestation(JOB, worker, worker, 1);
        bytes memory sig = sign(att, platformKey);

        vm.prank(worker);
        vm.expectRevert(RatingRegistry.SelfRatingForbidden.selector);
        ratings.submitRating(att, sig, 5, bytes32(0));
    }

    function test_revert_workerNotRegistered() public {
        // Signed with roguePlatformKey, not platformKey, on purpose. WorkerRegistry
        // declares its own WorkerNotRegistered() error, and custom-error selectors
        // are bytes4(keccak256(signature)) with no contract scoping, so the two
        // errors collide at the selector level. Signing with the allowlisted
        // platformKey would let this assertion pass even if RatingRegistry's own
        // check 5 (the one under test) were deleted, because execution would then
        // fall through to WorkerRegistry.recordRating's identical-selector revert.
        // Signing with a non-allowlisted key instead means: if check 5 fires,
        // we get WorkerNotRegistered as expected; if check 5 were removed,
        // recovery would yield an unknown signer and we'd get UnknownPlatform
        // instead, failing the assertion below. That makes this test actually
        // prove check 5 exists. Do not "fix" this back to platformKey.
        address unregistered = address(0x9999);
        RatingRegistry.Attestation memory att = attestation(JOB, unregistered, client, 1);
        bytes memory sig = sign(att, roguePlatformKey);

        vm.prank(client);
        vm.expectRevert(RatingRegistry.WorkerNotRegistered.selector);
        ratings.submitRating(att, sig, 5, bytes32(0));
    }

    function test_revert_completionInTheFuture() public {
        RatingRegistry.Attestation memory att = attestation(JOB, worker, client, 1);
        att.completedAt = uint64(block.timestamp + 1);
        bytes memory sig = sign(att, platformKey);

        vm.prank(client);
        vm.expectRevert(RatingRegistry.FutureCompletion.selector);
        ratings.submitRating(att, sig, 5, bytes32(0));
    }

    function test_revert_signerNotOnTheAllowlist() public {
        RatingRegistry.Attestation memory att = attestation(JOB, worker, client, 1);
        bytes memory sig = sign(att, roguePlatformKey);

        vm.prank(client);
        vm.expectRevert(RatingRegistry.UnknownPlatform.selector);
        ratings.submitRating(att, sig, 5, bytes32(0));
    }

    function test_revert_nonceReusedAcrossDifferentJobs() public {
        RatingRegistry.Attestation memory first = attestation(keccak256("job-a"), worker, client, 42);
        bytes memory firstSig = sign(first, platformKey);
        vm.prank(client);
        ratings.submitRating(first, firstSig, 5, bytes32(0));

        RatingRegistry.Attestation memory second = attestation(keccak256("job-b"), worker, client, 42);
        bytes memory secondSig = sign(second, platformKey);
        vm.prank(client);
        vm.expectRevert(RatingRegistry.NonceUsed.selector);
        ratings.submitRating(second, secondSig, 5, bytes32(0));
    }

    function test_nonceNamespacesAreSeparatePerPlatform() public {
        vm.prank(owner);
        uint32 secondPlatformId = platforms.registerPlatform(vm.addr(0xC0FFEE), keccak256("Tukangku"));

        RatingRegistry.Attestation memory first = attestation(keccak256("job-a"), worker, client, 42);
        bytes memory firstSig = sign(first, platformKey);
        vm.prank(client);
        ratings.submitRating(first, firstSig, 5, bytes32(0));

        RatingRegistry.Attestation memory second = attestation(keccak256("job-b"), worker, client, 42);
        bytes memory secondSig = sign(second, 0xC0FFEE);
        vm.prank(client);
        ratings.submitRating(second, secondSig, 4, bytes32(0));

        assertTrue(ratings.nonceUsed(platformId, 42));
        assertTrue(ratings.nonceUsed(secondPlatformId, 42));

        (, uint32 count,) = workers.statsOf(worker);
        assertEq(count, 2, "two platforms may each spend nonce 42");

        RatingRegistry.Rating memory storedSecond = ratings.ratingOf(keccak256("job-b"));
        assertEq(
            storedSecond.platformId, secondPlatformId, "platformId must derive from the recovered signer"
        );
    }

    function test_revert_signatureOverTamperedFields() public {
        RatingRegistry.Attestation memory signed = attestation(JOB, worker, client, 1);
        bytes memory sig = sign(signed, platformKey);

        RatingRegistry.Attestation memory tampered = signed;
        tampered.worker = address(0x7777);
        registerWorker(tampered.worker);

        vm.prank(client);
        vm.expectRevert(RatingRegistry.UnknownPlatform.selector);
        ratings.submitRating(tampered, sig, 5, bytes32(0));
    }

    function test_revert_scoreIsCheckedBeforeAnythingElse() public {
        // Deliberately invalid on several counts at once. An out-of-range score
        // must be rejected first, so a junk request never pays for recovery.
        RatingRegistry.Attestation memory att = attestation(JOB, address(0x9999), client, 1);
        att.completedAt = uint64(block.timestamp + 1 days);
        bytes memory sig = sign(att, roguePlatformKey);

        vm.prank(client);
        vm.expectRevert(RatingRegistry.InvalidScore.selector);
        ratings.submitRating(att, sig, 9, bytes32(0));
    }

    function testFuzz_revert_anyScoreOutsideOneToFive(uint8 score) public {
        vm.assume(score == 0 || score > 5);

        RatingRegistry.Attestation memory att = attestation(JOB, worker, client, 1);
        bytes memory sig = sign(att, platformKey);

        vm.prank(client);
        vm.expectRevert(RatingRegistry.InvalidScore.selector);
        ratings.submitRating(att, sig, score, bytes32(0));
    }

    function testFuzz_revert_onlyTheAttestedClientMaySubmit(address sender) public {
        vm.assume(sender != client);
        vm.assume(sender != address(0));

        RatingRegistry.Attestation memory att = attestation(JOB, worker, client, 1);
        bytes memory sig = sign(att, platformKey);

        vm.prank(sender);
        vm.expectRevert(RatingRegistry.NotTheClient.selector);
        ratings.submitRating(att, sig, 5, bytes32(0));
    }
}
