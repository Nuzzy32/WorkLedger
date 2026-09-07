# Contracts

Solidity 0.8.24. Foundry. No proxies, no upgrades.

## PlatformRegistry

```solidity
interface IPlatformRegistry {
    function registerPlatform(address signer, bytes32 nameHash)
        external returns (uint32 platformId);
    function deactivatePlatform(uint32 platformId) external;
    function isActiveSigner(address signer) external view returns (bool);
    function platformIdOf(address signer) external view returns (uint32);
}
```

Owner-only writes. `Ownable` from OpenZeppelin, no custom access control.

The README admits that one key controls this. Do not paper over it in the UI.

## WorkerRegistry

```solidity
interface IWorkerRegistry {
    function register() external;
    function isRegistered(address worker) external view returns (bool);
    function statsOf(address worker) external view returns (
        uint64 registeredAt,
        uint32 ratingCount,
        uint32 scoreSum
    );
}
```

Self-registration. `msg.sender` becomes the worker. No admin approval, since
gatekeeping who may hold a reputation defeats the point.

`RatingRegistry` is the only contract allowed to update stats. Set that address
once in the constructor and reject writes from anywhere else.

## RatingRegistry

```solidity
interface IRatingRegistry {
    struct Attestation {
        bytes32 jobId;
        address worker;
        address client;
        uint64  completedAt;
        uint256 nonce;
    }

    function submitRating(
        Attestation calldata att,
        bytes calldata platformSignature,
        uint8 score,
        bytes32 contentHash
    ) external;

    function ratingOf(bytes32 jobId) external view returns (Rating memory);
    function scoreOf(address worker) external view returns (uint256 scoreBps);
}
```

### Checks in submitRating

Order matters. Cheap checks first, signature recovery last.

```
1. score is 1..5                          else InvalidScore()
2. ratings[jobId] is empty                else JobAlreadyRated()
3. msg.sender == att.client               else NotTheClient()
4. att.worker != att.client               else SelfRatingForbidden()
5. worker is registered                   else WorkerNotRegistered()
6. att.completedAt <= block.timestamp     else FutureCompletion()
7. nonce unused for this platform         else NonceUsed()
8. recover signer from EIP-712 digest
9. signer is an active platform           else UnknownPlatform()
10. write rating, bump worker stats, emit event
```

### EIP-712 domain

```solidity
bytes32 constant ATTESTATION_TYPEHASH = keccak256(
    "Attestation(bytes32 jobId,address worker,address client,uint64 completedAt,uint256 nonce)"
);
```

Domain name `PortaRep`, version `1`, and the chain id must be in the domain
separator. Leave out the chain id and a signature from one network replays on
another.

## Scoring

Computed on chain. Returns basis points, so 4.32 stars reads as `43200`.

```
displayScore = (scoreSum + PRIOR_WEIGHT * PRIOR_SCORE)
             / (ratingCount + PRIOR_WEIGHT)
```

With `PRIOR_SCORE = 3.0` and `PRIOR_WEIGHT = 5`.

### Why a prior

A fresh account starts at 3.0, below the roughly 4.6 average of a real rating
pool. Someone who abandons a bad history and registers again lands lower than
where they left, so whitewashing costs them instead of paying off.

It also stops a single 5-star rating from producing a perfect profile. One rating
gives `(5 + 15) / 6 = 3.33`, which reads as unproven rather than flawless.

### Rounding

Integer math truncates. Multiply by 10000 before dividing, never after. Write a
test that pins the expected basis points for a handful of inputs, since an
off-by-one in the rounding will otherwise slip through.

### Constants

Hardcode them as `immutable` and set them in the constructor. Making them
owner-settable hands the owner the power to rewrite everyone's score.

Changing either constant needs a decision from the project owner, not a
judgment call mid-task.

## Gas expectations

Record actual numbers from `forge test --gas-report` in the README. Rough targets:

| Function | Target |
|---|---|
| `register` | under 50k |
| `submitRating` | under 120k |
| `scoreOf` | view, free |

Signature recovery costs about 3k. Fine here. Do not try to optimize it away.

## Testing

Every state-changing function needs:

- one happy path test
- one test per revert path, asserting the specific custom error
- one fuzz test where a numeric input varies

Plus these scenarios:

- 100 Sybil accounts all rating one worker, without platform attestations, and all
  of them failing
- a worker abandoning a 2-star history for a new address, asserting the new score
  falls below the old one
- the same attestation submitted twice, second call reverting
- an attestation signed by a deactivated platform, reverting
- an attestation signed for a different chain id, reverting

Run `slither .` before opening a PR. Fix everything at medium or above. Note the
low-severity findings you chose to ignore, with a reason.
