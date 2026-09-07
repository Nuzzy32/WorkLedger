// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {PlatformRegistry} from "../src/PlatformRegistry.sol";

contract PlatformRegistryTest is Test {
    PlatformRegistry internal registry;

    address internal owner = address(0xB0B);
    address internal stranger = address(0xBAD);
    address internal signerA = address(0xA1);
    address internal signerB = address(0xA2);

    bytes32 internal nameA = keccak256("Kurirku");
    bytes32 internal nameB = keccak256("Tukangku");

    event PlatformRegistered(uint32 indexed platformId, address indexed signer);
    event PlatformDeactivated(uint32 indexed platformId);

    function setUp() public {
        vm.warp(1_700_000_000);
        registry = new PlatformRegistry(owner);
    }

    function test_register_assignsIdsStartingAtOne() public {
        vm.startPrank(owner);
        uint32 first = registry.registerPlatform(signerA, nameA);
        uint32 second = registry.registerPlatform(signerB, nameB);
        vm.stopPrank();

        assertEq(first, 1, "ids must start at 1 so 0 means unknown");
        assertEq(second, 2);
        assertEq(registry.platformCount(), 2);
    }

    function test_register_storesPlatformAndEmits() public {
        vm.expectEmit(true, true, false, false);
        emit PlatformRegistered(1, signerA);

        vm.prank(owner);
        uint32 id = registry.registerPlatform(signerA, nameA);

        PlatformRegistry.Platform memory p = registry.platformAt(id);
        assertEq(p.signer, signerA);
        assertEq(p.nameHash, nameA);
        assertEq(p.registeredAt, uint64(block.timestamp));
        assertTrue(p.active);

        assertTrue(registry.isActiveSigner(signerA));
        assertEq(registry.platformIdOf(signerA), 1);
    }

    function test_unknownSignerIsNotActiveAndMapsToZero() public view {
        assertFalse(registry.isActiveSigner(signerA));
        assertEq(registry.platformIdOf(signerA), 0);
    }

    function test_deactivate_clearsActiveButKeepsIdMapping() public {
        vm.prank(owner);
        uint32 id = registry.registerPlatform(signerA, nameA);

        vm.expectEmit(true, false, false, false);
        emit PlatformDeactivated(id);

        vm.prank(owner);
        registry.deactivatePlatform(id);

        assertFalse(registry.isActiveSigner(signerA), "deactivated signer must not be active");
        assertEq(registry.platformIdOf(signerA), id, "id mapping survives so history stays readable");
        assertFalse(registry.platformAt(id).active);
    }

    function test_revert_registerZeroSigner() public {
        vm.prank(owner);
        vm.expectRevert(PlatformRegistry.ZeroAddress.selector);
        registry.registerPlatform(address(0), nameA);
    }

    function test_revert_registerDuplicateSigner() public {
        vm.startPrank(owner);
        registry.registerPlatform(signerA, nameA);
        vm.expectRevert(PlatformRegistry.SignerAlreadyRegistered.selector);
        registry.registerPlatform(signerA, nameB);
        vm.stopPrank();
    }

    function test_revert_deactivateUnknownId() public {
        vm.prank(owner);
        vm.expectRevert(PlatformRegistry.UnknownPlatformId.selector);
        registry.deactivatePlatform(42);
    }

    function test_revert_registerFromNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        registry.registerPlatform(signerA, nameA);
    }

    function test_revert_deactivateFromNonOwner() public {
        vm.prank(owner);
        uint32 id = registry.registerPlatform(signerA, nameA);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        registry.deactivatePlatform(id);
    }

    function testFuzz_everyRegisteredSignerResolvesToItsId(address signer, bytes32 nameHash) public {
        vm.assume(signer != address(0));

        vm.prank(owner);
        uint32 id = registry.registerPlatform(signer, nameHash);

        assertEq(registry.platformIdOf(signer), id);
        assertTrue(registry.isActiveSigner(signer));
    }
}
