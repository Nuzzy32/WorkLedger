// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title WorkerRegistry
/// @notice Worker registration and the two aggregates that back the on-chain score.
/// @dev Registration is open on purpose. Gatekeeping who may hold a reputation
///      defeats the point of a portable one.
///      No name, no email, no id — the wallet address is the only key. Chain data
///      cannot be deleted, so personal data must never land here.
contract WorkerRegistry {
    /// @param registeredAt Block timestamp of registration.
    /// @param ratingCount Number of ratings received.
    /// @param scoreSum Sum of received scores, each 1..5.
    /// @param exists True once registered.
    /// @dev Packs into a single storage slot (17 of 32 bytes). Storing aggregates
    ///      rather than an array of ratings keeps reads at fixed cost as history grows.
    struct Worker {
        uint64 registeredAt;
        uint32 ratingCount;
        uint32 scoreSum;
        bool exists;
    }

    error AlreadyRegistered();
    error NotRatingRegistry();
    error NotInitializer();
    error AlreadyInitialized();
    error ZeroAddress();
    error WorkerNotRegistered();

    event WorkerRegistered(address indexed worker, uint64 registeredAt);
    event RatingRegistrySet(address indexed registry);

    /// @notice The only address permitted to update worker stats.
    address public ratingRegistry;

    address private immutable INITIALIZER;

    mapping(address => Worker) private _workers;

    constructor() {
        INITIALIZER = msg.sender;
    }

    /// @notice Wire up the RatingRegistry. Callable exactly once, by the deployer.
    /// @dev docs/CONTRACTS.md asks for a constructor argument, but RatingRegistry's
    ///      constructor needs this contract's address and vice versa — a deployment
    ///      cycle. A write-once setter reaches the same end state with no cycle.
    ///      See docs/DECISIONS.md.
    /// @param registry Address of the deployed RatingRegistry.
    function setRatingRegistry(address registry) external {
        if (msg.sender != INITIALIZER) revert NotInitializer();
        if (ratingRegistry != address(0)) revert AlreadyInitialized();
        if (registry == address(0)) revert ZeroAddress();

        ratingRegistry = registry;
        emit RatingRegistrySet(registry);
    }

    /// @notice Register the caller as a worker. No admin approval.
    function register() external {
        Worker storage worker = _workers[msg.sender];
        if (worker.exists) revert AlreadyRegistered();

        worker.exists = true;
        worker.registeredAt = uint64(block.timestamp);

        emit WorkerRegistered(msg.sender, worker.registeredAt);
    }

    /// @notice Whether an address has registered as a worker.
    /// @param worker Address to check.
    /// @return True if registered.
    function isRegistered(address worker) external view returns (bool) {
        return _workers[worker].exists;
    }

    /// @notice Aggregates backing a worker's score.
    /// @param worker Address to read.
    /// @return registeredAt Registration timestamp, 0 if unregistered.
    /// @return ratingCount Number of ratings received.
    /// @return scoreSum Sum of received scores.
    function statsOf(address worker)
        external
        view
        returns (uint64 registeredAt, uint32 ratingCount, uint32 scoreSum)
    {
        Worker storage record = _workers[worker];
        return (record.registeredAt, record.ratingCount, record.scoreSum);
    }

    /// @notice Add one rating to a worker's aggregates.
    /// @dev Restricted to `ratingRegistry`, which has already validated the score
    ///      range and the platform attestation. Reverts before initialization
    ///      because `ratingRegistry` is then the zero address.
    /// @param worker Worker being rated.
    /// @param score Score to add, 1..5, validated by the caller.
    function recordRating(address worker, uint8 score) external {
        if (msg.sender != ratingRegistry) revert NotRatingRegistry();

        Worker storage record = _workers[worker];
        if (!record.exists) revert WorkerNotRegistered();

        record.ratingCount += 1;
        record.scoreSum += score;
    }
}
