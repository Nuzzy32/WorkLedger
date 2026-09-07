// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {EIP712} from "openzeppelin-contracts/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";
import {PlatformRegistry} from "./PlatformRegistry.sol";
import {WorkerRegistry} from "./WorkerRegistry.sol";

/// @title RatingRegistry
/// @notice Records ratings that an allowlisted platform has attested to, and
///         computes each worker's score on chain.
/// @dev A rating counts only with a valid EIP-712 attestation from an active
///      platform. Without that rule anyone can rate anyone and the whole thing
///      is theater. Holds no funds and makes no external value transfers, so
///      there is no reentrancy surface.
contract RatingRegistry is EIP712 {
    /// @notice A platform's statement that a job actually happened.
    /// @param jobId Platform-scoped job identifier, also this contract's storage key.
    /// @param worker Worker who did the job.
    /// @param client Client who may submit the rating.
    /// @param completedAt When the job finished.
    /// @param nonce Per-platform replay guard.
    struct Attestation {
        bytes32 jobId;
        address worker;
        address client;
        uint64 completedAt;
        uint256 nonce;
    }

    /// @notice A stored rating. No names, no comment text — only the comment hash.
    /// @dev Field order packs this into 3 slots rather than 4: worker+platformId+score
    ///      fill 25 bytes of slot 0, client+submittedAt fill 28 of slot 1, contentHash
    ///      takes slot 2. That saves ~20k gas on the hottest write in the system.
    ///      docs/DATA-MODEL.md lists a different order; see docs/DECISIONS.md.
    struct Rating {
        address worker;
        uint32 platformId;
        uint8 score;
        address client;
        uint64 submittedAt;
        bytes32 contentHash;
    }

    bytes32 private constant ATTESTATION_TYPEHASH = keccak256(
        "Attestation(bytes32 jobId,address worker,address client,uint64 completedAt,uint256 nonce)"
    );

    uint256 private constant BPS = 10_000;

    error InvalidScore();
    error JobAlreadyRated();
    error NotTheClient();
    error SelfRatingForbidden();
    error WorkerNotRegistered();
    error FutureCompletion();
    error NonceUsed();
    error UnknownPlatform();
    error InvalidPrior();
    error ZeroAddress();

    /// @dev `worker` is indexed so the app reads one worker's history cheaply.
    ///      `score` is not indexed because nobody filters on it.
    event RatingSubmitted(
        bytes32 indexed jobId, address indexed worker, address indexed client, uint32 platformId, uint8 score
    );

    /// @notice The WorkerRegistry this contract reports ratings and scores into.
    WorkerRegistry public immutable WORKERS;

    /// @notice The PlatformRegistry that allowlists which signers may attest to jobs.
    PlatformRegistry public immutable PLATFORMS;

    /// @notice Prior score in basis points. 30000 is 3.00 stars.
    /// @dev Immutable on purpose. An owner-settable prior would let the owner
    ///      rewrite everyone's score. See docs/SECURITY.md.
    uint256 public immutable PRIOR_SCORE_BPS;

    /// @notice How many phantom prior ratings the prior is worth.
    uint32 public immutable PRIOR_WEIGHT;

    mapping(bytes32 => Rating) private _ratings;
    mapping(uint32 => mapping(uint256 => bool)) private _nonceUsed;

    /// @param workers Deployed WorkerRegistry.
    /// @param platforms Deployed PlatformRegistry.
    /// @param priorScoreBps Prior score in bps, between 10000 and 50000.
    /// @param priorWeight Prior weight, at least 1.
    constructor(WorkerRegistry workers, PlatformRegistry platforms, uint256 priorScoreBps, uint32 priorWeight)
        EIP712("PortaRep", "1")
    {
        if (address(workers) == address(0) || address(platforms) == address(0)) revert ZeroAddress();
        if (priorScoreBps < BPS || priorScoreBps > 5 * BPS || priorWeight == 0) revert InvalidPrior();

        WORKERS = workers;
        PLATFORMS = platforms;
        PRIOR_SCORE_BPS = priorScoreBps;
        PRIOR_WEIGHT = priorWeight;
    }

    /// @notice Submit a rating for an attested job.
    /// @param att The platform's attestation.
    /// @param platformSignature EIP-712 signature over `att` by an active platform signer.
    /// @param score Score from 1 to 5.
    /// @param contentHash keccak256 of the off-chain comment, or 0 if there is none.
    function submitRating(
        Attestation calldata att,
        bytes calldata platformSignature,
        uint8 score,
        bytes32 contentHash
    ) external {
        // Task 5 fills this in.
    }

    /// @notice Read a stored rating.
    /// @param jobId Job identifier.
    /// @return The rating. A zero `worker` means no rating exists for this job.
    function ratingOf(bytes32 jobId) external view returns (Rating memory) {
        return _ratings[jobId];
    }

    /// @notice Whether a platform has already spent a nonce.
    /// @param platformId Platform whose nonce namespace to check.
    /// @param nonce Nonce value.
    /// @return True if already used.
    function nonceUsed(uint32 platformId, uint256 nonce) external view returns (bool) {
        return _nonceUsed[platformId][nonce];
    }

    /// @notice The EIP-712 digest a platform must sign for an attestation.
    /// @dev Exposed so the platform backend and the tests derive the digest from
    ///      the contract rather than reimplementing the domain separator.
    /// @param att Attestation to hash.
    /// @return The typed-data digest.
    function attestationDigest(Attestation calldata att) external view returns (bytes32) {
        return _digest(att);
    }

    /// @notice Score for a worker in basis points. 43200 reads as 4.32 stars.
    /// @param worker Worker to score.
    /// @return scoreBps Score in basis points.
    function scoreOf(address worker) external view returns (uint256 scoreBps) {
        (, uint32 ratingCount, uint32 scoreSum) = WORKERS.statsOf(worker);
        return previewScoreBps(ratingCount, scoreSum);
    }

    /// @notice Score for hypothetical aggregates, in basis points.
    /// @dev Backs the "how many more jobs raise my score to the next band" view
    ///      and the score breakdown, so the UI never reimplements this formula.
    ///      Multiplies by BPS before dividing; reversing that loses the fraction.
    /// @param ratingCount Number of ratings.
    /// @param scoreSum Sum of scores.
    /// @return Score in basis points, truncated toward zero.
    function previewScoreBps(uint32 ratingCount, uint32 scoreSum) public view returns (uint256) {
        return (uint256(scoreSum) * BPS + uint256(PRIOR_WEIGHT) * PRIOR_SCORE_BPS)
            / (uint256(ratingCount) + uint256(PRIOR_WEIGHT));
    }

    /// @dev EIP-712 digest for an attestation. The domain separator carries the
    ///      chain id, so a signature for one network cannot replay on another.
    function _digest(Attestation calldata att) private view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ATTESTATION_TYPEHASH, att.jobId, att.worker, att.client, att.completedAt, att.nonce
                )
            )
        );
    }
}
