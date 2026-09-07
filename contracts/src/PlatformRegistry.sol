// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

/// @title PlatformRegistry
/// @notice Allowlist of platform keys permitted to sign job attestations.
/// @dev One owner key controls this list. That is a deliberate, documented limit,
///      not an oversight: see README.md "Known limits".
contract PlatformRegistry is Ownable {
    /// @param signer Key that signs job attestations for this platform.
    /// @param registeredAt Block timestamp of registration.
    /// @param active False once the owner deactivates the platform.
    /// @param nameHash keccak256 of the platform name. The name itself lives in Postgres,
    ///        so anyone can hash the name they were shown and compare it here.
    /// @dev Field order packs signer+registeredAt+active into one slot (29 of 32 bytes).
    struct Platform {
        address signer;
        uint64 registeredAt;
        bool active;
        bytes32 nameHash;
    }

    error ZeroSigner();
    error SignerAlreadyRegistered();
    error UnknownPlatformId();

    event PlatformRegistered(uint32 indexed platformId, address indexed signer);
    event PlatformDeactivated(uint32 indexed platformId);

    /// @notice Number of platforms ever registered. Ids run 1..platformCount.
    uint32 public platformCount;

    mapping(uint32 => Platform) private _platforms;
    mapping(address => uint32) private _platformIdOf;

    /// @param initialOwner Address that may register and deactivate platforms.
    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Add a platform and its attestation signing key to the allowlist.
    /// @param signer Key that will sign attestations. Must not already be registered.
    /// @param nameHash keccak256 of the platform's display name.
    /// @return platformId Newly assigned id, always 1 or greater.
    function registerPlatform(address signer, bytes32 nameHash)
        external
        onlyOwner
        returns (uint32 platformId)
    {
        if (signer == address(0)) revert ZeroSigner();
        if (_platformIdOf[signer] != 0) revert SignerAlreadyRegistered();

        platformId = ++platformCount;
        _platforms[platformId] = Platform({
            signer: signer,
            // casting to 'uint64' is safe because a unix timestamp does not
            // exceed type(uint64).max until the year 2554, and uint64 is the
            // field width docs/DATA-MODEL.md declares for registeredAt.
            // forge-lint: disable-next-line(unsafe-typecast)
            registeredAt: uint64(block.timestamp),
            active: true,
            nameHash: nameHash
        });
        _platformIdOf[signer] = platformId;

        emit PlatformRegistered(platformId, signer);
    }

    /// @notice Stop accepting new attestations from a platform.
    /// @dev Ratings already submitted stay valid. The signer keeps its id so that
    ///      historical ratings still resolve to a platform in the UI.
    /// @param platformId Id of the platform to deactivate.
    function deactivatePlatform(uint32 platformId) external onlyOwner {
        Platform storage platform = _platforms[platformId];
        if (platform.signer == address(0)) revert UnknownPlatformId();

        platform.active = false;
        emit PlatformDeactivated(platformId);
    }

    /// @notice Whether a signer may currently sign attestations.
    /// @param signer Address recovered from an attestation signature.
    /// @return True only if the signer is registered and not deactivated.
    function isActiveSigner(address signer) external view returns (bool) {
        uint32 platformId = _platformIdOf[signer];
        return platformId != 0 && _platforms[platformId].active;
    }

    /// @notice Platform id for a signer, or 0 if the signer was never registered.
    /// @param signer Address to look up.
    /// @return Platform id, 0 meaning unknown.
    function platformIdOf(address signer) external view returns (uint32) {
        return _platformIdOf[signer];
    }

    /// @notice Full platform record for an id.
    /// @param platformId Id to read.
    /// @return The stored Platform. A zero `signer` means the id was never assigned.
    function platformAt(uint32 platformId) external view returns (Platform memory) {
        return _platforms[platformId];
    }
}
