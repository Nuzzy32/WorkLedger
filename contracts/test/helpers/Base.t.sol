// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {PlatformRegistry} from "../../src/PlatformRegistry.sol";
import {WorkerRegistry} from "../../src/WorkerRegistry.sol";
import {RatingRegistry} from "../../src/RatingRegistry.sol";

/// @dev Shared deploy plus attestation signing. Every RatingRegistry test needs
///      the same three-contract wiring and the same signing dance.
abstract contract Base is Test {
    PlatformRegistry internal platforms;
    WorkerRegistry internal workers;
    RatingRegistry internal ratings;

    address internal owner = address(0xB0B);
    address internal worker = address(0x1111);
    address internal client = address(0x2222);

    uint256 internal platformKey = 0xA11CE;
    address internal platformSigner;
    uint32 internal platformId;

    uint256 internal roguePlatformKey = 0xBADBAD;
    address internal roguePlatformSigner;

    function setUp() public virtual {
        vm.warp(1_700_000_000);

        platformSigner = vm.addr(platformKey);
        roguePlatformSigner = vm.addr(roguePlatformKey);

        platforms = new PlatformRegistry(owner);
        workers = new WorkerRegistry();
        ratings = new RatingRegistry(workers, platforms, 30_000, 5);
        workers.setRatingRegistry(address(ratings));

        vm.prank(owner);
        platformId = platforms.registerPlatform(platformSigner, keccak256("Kurirku"));

        registerWorker(worker);
    }

    function registerWorker(address account) internal {
        vm.prank(account);
        workers.register();
    }

    function attestation(bytes32 jobId, address workerAddr, address clientAddr, uint256 nonce)
        internal
        view
        returns (RatingRegistry.Attestation memory)
    {
        return RatingRegistry.Attestation({
            jobId: jobId,
            worker: workerAddr,
            client: clientAddr,
            completedAt: uint64(block.timestamp - 1 hours),
            nonce: nonce
        });
    }

    /// @dev Signs the digest the contract itself derives, so the test cannot pass
    ///      by reimplementing the domain separator wrongly in the same wrong way.
    function sign(RatingRegistry.Attestation memory att, uint256 key) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, ratings.attestationDigest(att));
        return abi.encodePacked(r, s, v);
    }
}
