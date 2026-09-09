# Decisions

This file exists because the contracts, tests, and docs occasionally disagree
with each other, and a reviewer who spots one of those disagreements should
find the reasoning here instead of assuming a mistake. Every entry names the
doc it deviates from, why, and what it costs. `RatingRegistry.sol:38`,
`RatingRegistry.sol:110` (approximate — see the file's own `@dev` comments),
`WorkerRegistry.sol`, and `RatingRegistry.submit.t.sol` point here.

## A. `WorkerRegistry.setRatingRegistry` is a write-once setter, not a constructor argument

`docs/CONTRACTS.md` says to "Set that address once in the constructor." That is
impossible to do as written: `RatingRegistry`'s constructor takes
`WorkerRegistry`'s address, and `WorkerRegistry` would need `RatingRegistry`'s
address in its own constructor to satisfy the doc literally — a deployment
cycle with no satisfying order, since neither contract can exist before the
other.

`docs/SECURITY.md`'s "Access control gaps" row is a second document this
deviation touches: it described the stats-update caller as "constructor-set"
until corrected to "deployer-set once," matching the setter below.

**Resolution.** `WorkerRegistry` exposes `setRatingRegistry(address)`,
callable exactly once, only by the address that deployed `WorkerRegistry`
(`INITIALIZER`, captured in the constructor). A second call reverts
`AlreadyInitialized()`, and a call from any other address reverts
`NotInitializer()`. The deploy order becomes: deploy `WorkerRegistry`, deploy
`RatingRegistry` (passing `WorkerRegistry`'s address), then call
`setRatingRegistry` with `RatingRegistry`'s address. Same write-once end
state as a constructor argument, no cycle.

**Cost.** Not just one extra transaction — a separate transaction that can be
forgotten in a way a constructor argument cannot. A constructor argument is
part of the deploy call; there is no state where the contract exists but the
argument was skipped. `setRatingRegistry` is not: deploy `WorkerRegistry`,
deploy `RatingRegistry`, and stop, and the result is a system where workers
register successfully and no rating can ever be recorded — permanently,
since the setter is callable exactly once and only by `INITIALIZER`. The
only fix is redeploying `WorkerRegistry`, which loses every registration
made against it. Calling the setter with the wrong address is just as
permanent: `AlreadyInitialized()` blocks any correction, and the freeze is
identical. There is also one more codepath (`recordRating` reverts with
`NotRatingRegistry()` before initialization, since `ratingRegistry` reads as
`address(0)` until the setter runs).

**Mitigation owed to the next milestone.** The deploy script must call
`setRatingRegistry` and assert `workers.ratingRegistry() ==
address(ratings)` before it reports success, rather than assuming the call
landed. The deployment record it produces should carry all three
addresses — `WorkerRegistry`, `PlatformRegistry`, and `RatingRegistry` — so
the wiring is auditable after the fact instead of only inferable from a
successful `setRatingRegistry` transaction.

## B. The nonce check runs after signature recovery, not before

`docs/CONTRACTS.md`'s check list puts the nonce check at step 7, before
signature recovery at step 8, under the heading "cheap checks first, signature
recovery last." Those two instructions are incompatible: the nonce is tracked
per platform (`_nonceUsed[platformId][nonce]`), and the platform is not known
until the signer is recovered and mapped to a platform id. There is no way to
check "is this nonce used" before recovery without first deciding whose nonce
namespace to look in.

**Resolution.** The nonce check runs at step 9, immediately after signer
recovery (step 8) and the active-signer check. `submitRating`'s own `@dev`
comment documents this. Nothing is left unguarded in the meantime: duplicate
submission of the same job is independently blocked by check 2
(`_ratings[att.jobId].worker != address(0)`), since `jobId` is the storage
key. The nonce exists to stop a *different* replay shape — reusing one
attestation's signature across distinct fabricated `jobId`s — which check 2
cannot catch, but there was never a window where duplicate submission was
possible only because of check ordering.

**Cost.** None beyond what recovery already costs. The nonce check itself is
a single cold `SLOAD` either way.

## C. Two structs are reordered for storage packing

`RatingRegistry.Rating` is declared `worker, platformId, score, client,
submittedAt, contentHash`. `docs/DATA-MODEL.md` declares it `worker, client,
platformId, score, submittedAt, contentHash` — a different order, same
fields and types.

The two orders pack differently. `docs/DATA-MODEL.md`'s order — `worker,
client, platformId, score, submittedAt, contentHash` — puts `address worker`
(20 bytes) alone in slot 0, since the next field, `address client`, is
another full 20-byte value that cannot share a slot with it. Slot 1 then
holds `client` (20B) + `platformId` (4B) + `score` (1B), 25 of 32 bytes;
`submittedAt`'s 8 more bytes would make 33, so it spills into slot 2 alone.
`contentHash` (32B, a full word regardless) takes slot 3 — 4 slots. The
contract's order
packs `worker` (20B) + `platformId` (4B) + `score` (1B) into 25 of slot 0's
32 bytes, `client` (20B) + `submittedAt` (8B) into 28 of slot 1's 32 bytes,
and `contentHash` (32B, a full word regardless) into slot 2 — 3 slots.

`PlatformRegistry.Platform` is declared `signer, registeredAt, active,
nameHash` — 2 slots (`signer` 20B + `registeredAt` 8B + `active` 1B = 29 of
slot 0, `nameHash` 32B in slot 1). `docs/DATA-MODEL.md` declares it `signer,
nameHash, registeredAt, active`, which forces `nameHash` (a full 32-byte
word) into its own slot immediately after `signer`, pushing `registeredAt`
and `active` into a third slot — 3 slots. Only the `Rating` reordering was
originally called out in the contract's own comments; the `Platform`
reordering is recorded here for the same reason.

**Resolution.** Both structs keep every field name and type
`docs/DATA-MODEL.md` specifies. Only declaration order changes, which is
storage-layout-only and invisible to any consumer reading fields by name
(the generated getters and ABI structs still expose fields with the same
names and types).

**Cost.** Saves one cold `SSTORE` (~20,000 gas) on `Rating` and one on
`Platform`'s write path relative to the documented order.

## D. No `interfaces/` directory

`docs/CONTRACTS.md` presents `IPlatformRegistry`, `IWorkerRegistry`, and
`IRatingRegistry` as Solidity interfaces to describe each contract's API.
None of those interfaces exist as separate files or types in `contracts/src/`.
`RatingRegistry` imports the concrete `PlatformRegistry` and `WorkerRegistry`
contracts directly and calls them as such (`WORKERS.recordRating(...)`,
`PLATFORMS.isActiveSigner(...)`).

**Resolution.** No import cycle exists here — neither `PlatformRegistry` nor
`WorkerRegistry` imports `RatingRegistry` back — so an interface layer isn't
needed to break a cycle. An interface with exactly one implementation, in one
repo, with no second consumer inside Solidity, buys nothing: it is an extra
file to keep in sync with every function signature change, for no test or
deployment benefit. The frontend, which is the actual second consumer,
integrates against the compiled ABI JSON, not a Solidity interface file.
Every function signature `docs/CONTRACTS.md` documents under
`IPlatformRegistry` / `IWorkerRegistry` / `IRatingRegistry` is implemented
verbatim by the concrete contracts — the interfaces in the doc describe a
real, matching API, they just were never asked to exist as their own `.sol`
files.

**Cost.** None; this is a file-that-was-never-written, not a functional gap.

## E. `WorkerRegistry` emits `RatingRegistrySet(address indexed registry)`

`docs/DATA-MODEL.md`'s event list has `PlatformRegistered`,
`PlatformDeactivated`, `WorkerRegistered`, and `RatingSubmitted` — no event
for wiring `WorkerRegistry` to `RatingRegistry`.

**Resolution.** This event is a direct consequence of decision A: turning the
constructor argument the docs originally imagined into a write-once setter
call. A setter that changes contract state exactly once, forever, and emits
nothing leaves no on-chain record of *when* the two registries were
connected — an indexer or a block explorer has no way to know until it
happens to read `ratingRegistry()` and see it non-zero. `RatingRegistrySet`
gives that moment a log.

**Cost.** One `LOG2` at deploy time, once per deployment.

## F. `WorkerRegistry`'s "worker does not exist" error is `UnknownWorker()`, not `WorkerNotRegistered()`

This is a security-testing lesson, not a style choice. Solidity custom-error
selectors are `bytes4(keccak256("ErrorName(types)"))` with no contract-level
namespacing. Early in this project, both `WorkerRegistry` and
`RatingRegistry` declared `error WorkerNotRegistered()` — different
contracts, same error name and signature, so the *same* 4-byte selector,
`0x50249dc4`.

The consequence was concrete, not theoretical: `RatingRegistry`'s own check 5
(`if (!WORKERS.isRegistered(att.worker)) revert WorkerNotRegistered();`) could
be deleted entirely and `test_revert_workerNotRegistered` would still pass.
With check 5 gone, execution falls through to `WORKERS.recordRating(...)`,
which reverts with `WorkerRegistry.UnknownWorker` — or, before the rename,
its identically-selectored `WorkerNotRegistered` — for the same underlying
reason (the worker never registered). The test asserted on the selector, the
selector matched either way, and a real missing check would have shipped
looking tested.

**Resolution.** `WorkerRegistry`'s error was renamed to `UnknownWorker()` —
no spec document names this error, so nothing was contradicted by renaming
it. `RatingRegistry` keeps `WorkerNotRegistered()`, the name
`docs/CONTRACTS.md:74`'s check list mandates. The test was also changed to
sign the attestation with a key that is not on the platform allowlist, so a
missing check 5 now surfaces as `RatingRegistry.UnknownPlatform` — a
different selector from `RatingRegistry.WorkerNotRegistered` — instead of
silently matching `WorkerRegistry`'s error by coincidence.

**Verification.** Mutation-tested by hand: commenting out check 5 and
re-running `test_revert_workerNotRegistered` fails with
`UnknownPlatform() != WorkerNotRegistered()`, proving the test now actually
depends on check 5 existing.

**Cost.** None; same bytecode size, different error name.

**The same class, found again.** `error ZeroAddress()` was independently
declared in all three contracts, and its selector — `0xd92e233d` — collides
across all three for the identical reason: no contract-level namespacing.
No test was mis-certified by it, but only because every existing assertion
on `ZeroAddress` happened to sit on a call path involving just one of the
three contracts. That is incidental, not designed, and it is the same
collision class this entry documents for `WorkerNotRegistered` /
`UnknownWorker` — a lesson worth applying to every instance of a name, not
just the first one found. `PlatformRegistry`'s `ZeroAddress()` was renamed
to `ZeroSigner()` and `WorkerRegistry`'s to `ZeroRegistry()`;
`RatingRegistry` keeps `ZeroAddress()`, since no spec document names any of
the three and two renames already resolve the collision.

## G. Two gas instruments, two sets of numbers

Two tests — `WorkerRegistry.t.sol`'s `test_gas_registerUnderBudget` and
`RatingRegistry.submit.t.sol`'s `test_gas_submitRatingRegressionGuard` — guard
a `gasleft()` delta measured from inside the test contract: `before =
gasleft(); target.call(...); used = before - gasleft();`. That delta includes
roughly 5,000 gas of `vm.prank` bookkeeping and the CALL-frame overhead of
calling out of the test contract, none of which the callee itself ever pays.
Their bounds are therefore inflated on purpose: 55,000 for `register` and
155,000 for `submitRating`.

The real cost — what `forge test --gas-report` measures, calling the
function directly rather than through a wrapping `gasleft()` delta — is
45,021 for `register` and 145,190 for `submitRating` (see
`contracts/gas-report.txt`, and the README's Gas section). `docs/CONTRACTS.md`'s
"under 50k" / "under 120k" targets refer to these gas-report figures, not the
inflated test bounds.

**Resolution.** Both numbers are recorded here, against both instruments,
specifically so nobody re-tightens a `gasleft()`-delta bound to "match" the
gas-report figure — doing that would make the regression guard fail on
every run, since the delta always carries the ~5k of harness overhead the
report figure never includes.

## H. `submitRating` misses its 120k rough target at 145,190, and was not optimized further

`docs/CONTRACTS.md` labels its gas figures "Rough targets" and says outright:
"Signature recovery costs about 3k. Fine here. Do not try to optimize it
away." At 145,190 gas (see the README's Gas section and
`contracts/gas-report.txt`), `submitRating` misses the under-120k target by
about 21%.

**Why it wasn't optimized down.** Every lever actually available collides
with a different mandated design choice:

- Dropping a `Rating` struct field would break `docs/DATA-MODEL.md`, which
  specifies exactly those six fields.
- Dropping the per-platform nonce would break the replay defense
  `docs/SECURITY.md` describes under "Signature replay."
- The struct is already packed to the minimum 3 slots (decision C).
- Signature recovery is explicitly told not to be optimized away, above.

One lever does not collide with a mandated design and was still not taken:
`submitRating` calls `PLATFORMS.isActiveSigner(signer)` and then
`PLATFORMS.platformIdOf(signer)`, two external calls that both read the same
`_platformIdOf[signer]` slot. A single `PlatformRegistry` function returning
`(uint32 id, bool active)` would drop one of them — worth roughly 700 gas,
since the account and slot are already warm by the second call. That is
under 3% of the 25,190-gas gap to the 120k target, so it would not change
this entry's conclusion, and `docs/CONTRACTS.md` does not document such a
function on `IPlatformRegistry` — adding one means growing an interface the
spec already pins, for a sub-1%-of-total saving. Not taken; recorded so this
entry is exhaustive because the search was, not because it stopped early.

**The structural floor.** A successful `submitRating` call touches four cold
storage slots on its first write to each: the nonce mapping
(`_nonceUsed[platformId][nonce] = true`), and the three `Rating` slots
(`_ratings[att.jobId] = Rating({...})`, decision C's 3-slot layout). Each
cold `SSTORE` to a zero slot costs 20,000 gas, for 80,000 gas of irreducible
floor before any logic, cross-contract call, or signature check runs. On top
of that floor sits `WORKERS.recordRating` (a cross-contract call that itself
writes a packed slot), three cross-contract reads
(`WORKERS.isRegistered`, `PLATFORMS.isActiveSigner`,
`PLATFORMS.platformIdOf`), and ECDSA recovery. 145,190 is the accepted cost
of a design that writes real, permanent, tamper-evident state rather than a
number chosen to look good against a rough target written before the design
was built.

## I. The whitewashing test asserts the opposite of what `docs/CONTRACTS.md` requests, on purpose

`docs/CONTRACTS.md`'s Testing section (before this task's fix; see the
"Testing" section update in the same commit) asked for a test "a worker
abandoning a 2-star history for a new address, asserting the new score falls
below the old one." That assertion is arithmetically impossible with the
scoring formula this project actually specifies.

**The arithmetic.** With `PRIOR_SCORE_BPS = 30_000` (3.00 stars) and
`PRIOR_WEIGHT = 5`: a worker with 50 ratings averaging 2 stars
(`scoreSum = 100`) scores `(100 * 10_000 + 5 * 30_000) / (50 + 5) = 20_909`
(2.09 stars). A fresh address with no ratings scores `previewScoreBps(0, 0) =
30_000` (3.00 stars) — the prior itself. Resetting *raises* this worker's
score, not lowers it. `docs/SECURITY.md`'s "Whitewashing" section already
states this correctly as an accepted residual risk ("A worker sitting at 2.0
with 50 jobs still gains by resetting... Both sit outside this scope.").

**Resolution.** The suite carries two tests instead of the one the doc
originally asked for:

- `test_whitewashing_costsAWorkerAboveThePrior` proves the prior does its
  job for the common case: a worker with a history averaging above 3.0 —
  nearly every real worker, given the roughly 4.6-star average of a typical
  rating pool that `docs/CONTRACTS.md`'s "Why a prior" section assumes —
  loses score by abandoning their address.
- `test_whitewashing_lowRatedWorkerStillGains` pins the known gap: a worker
  below the prior still gains by resetting. This is not a bug to fix
  quietly; it is documented, tested, and stated as a limit in the README.

`docs/CONTRACTS.md`'s Testing section has been corrected to ask for both
tests instead of the one impossible assertion.

**Closing the gap.** Needs one-account-per-person — identity binding or a
zero-knowledge uniqueness proof — either of which is out of scope for this
milestone and changes the trust model in ways that need an explicit product
decision, not a scoring tweak.

## Note: renaming the project redeploys `RatingRegistry`

The EIP-712 domain name is the literal string `"WorkLedger"`
(`RatingRegistry.sol:93`). Since the domain separator folds the domain name
in, renaming the project changes it, which invalidates every attestation
signed under the old name and requires redeploying `RatingRegistry`. See the
README's rename note.
