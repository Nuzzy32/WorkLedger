# Slither

Command: `slither . --exclude-dependencies` (Slither is installed but not on
`PATH` in this environment, so it was invoked via its absolute install path)

Slither version: 0.11.6

Last run: 2026-09-07

Result: 8 findings, all Low or Informational. **No findings at Medium or
High.**

## One Medium finding was found and suppressed with justification, not ignored

The first run of Slither on this codebase (before this task's other changes)
reported one Medium-severity finding:

```
unused-return
RatingRegistry.scoreOf(address) ignores return value by
(None,ratingCount,scoreSum) = WORKERS.statsOf(worker)
```

`scoreOf` destructured `WorkerRegistry.statsOf`'s three return values as
`(, uint32 ratingCount, uint32 scoreSum) = WORKERS.statsOf(worker);`,
skipping `registeredAt` because the scoring formula never needs it. Slither's
`unused-return` detector exists to catch a specific bug class — silently
swallowing a return value that signals success or failure, such as an
ignored ERC20 `transfer` boolean — and by that standard this specific
instance is arguably a false positive: `statsOf` is a plain data read on an
immutable, trusted, in-repo contract with no success/failure return value,
and a failure there would revert the whole call rather than return a value
to ignore.

That argument was not used to wave the finding away, and it was not fixed by
contorting the source either. An earlier version of this fix named all three
return values explicitly (`uint64 registeredAt, uint32 ratingCount, uint32
scoreSum`) and then left a bare `registeredAt;` statement to keep the
compiler from flagging the unused local — which did make Slither stop
classifying the value as "ignored," but replaced one lint finding with code
that reads worse than the problem it solved: a dangling no-op statement any
future reader has to puzzle over, and a natural target for someone to delete
as dead code, which would silently reintroduce the finding.

`scoreOf` now keeps the idiomatic tuple-hole discard,
`(, uint32 ratingCount, uint32 scoreSum) = WORKERS.statsOf(worker);`, and the
Medium finding is suppressed directly with a `// slither-disable-next-line
unused-return` immediately above the call, plus a comment explaining that the
discard is deliberate — the formula only needs the two aggregates and
`registeredAt` is irrelevant to it. This is the same pattern already used in
this codebase for the three `uint64(block.timestamp)` casts (see below):
use the tool's own suppression mechanism with a documented reason, rather
than reshaping working code to satisfy a detector that cannot distinguish
"ignored a value that mattered" from "deliberately discarded a component the
formula does not need." Re-running Slither after this change confirms the
Medium finding no longer appears anywhere in the output, with no
`redundant-statements` (or any other) finding introduced in its place. Net
effect: no Medium finding, no behavior change, no new findings of any
severity.

## Low and informational findings, deliberately not changed

| Detector | Location | Why it stays |
|---|---|---|
| `timestamp` | `RatingRegistry.submitRating` | Flags `att.completedAt > block.timestamp` (`FutureCompletion`) and, swept in by the same function-level check, `_ratings[att.jobId].worker != address(0)` (`JobAlreadyRated`) — the second is not actually a timestamp comparison, Slither's heuristic just flags every comparison in a function once one timestamp comparison appears. The real comparison, rejecting a future-dated attestation, has nothing to gain from a few seconds of validator/miner clock drift: there is no value at stake to manipulate by nudging `block.timestamp` slightly, and rejecting only future dates (not tightly bounding past ones) already gives generous latitude. |
| `timestamp` | `PlatformRegistry.isActiveSigner` | Flags `platformId != 0 && _platforms[platformId].active` — a boolean/id comparison with no `block.timestamp` anywhere in it. This one is a Slither false positive from the same "the struct has a timestamp field, so flag comparisons that touch it" heuristic; `active` is a `bool`, not time-based. No change possible or needed. |
| `naming-convention` | `RatingRegistry.WORKERS`, `RatingRegistry.PLATFORMS`, `RatingRegistry.PRIOR_SCORE_BPS`, `RatingRegistry.PRIOR_WEIGHT`, `WorkerRegistry.INITIALIZER` | `SCREAMING_SNAKE_CASE` for constants and immutables is the project's own naming convention (`CLAUDE.md`), not an oversight. Renaming to `mixedCase` would contradict the project's own style rules to satisfy a linter default. |
| `pragma` | whole project | Two solc version constraints are in play: `0.8.24` (pinned exactly in `src/`, per `CLAUDE.md` and `foundry.toml`) and OpenZeppelin's `^0.8.20` in `lib/`. The pin is deliberate — reproducible bytecode for Basescan verification — and this repo's own contracts do not have mixed pragmas; the mismatch is against a vendored dependency, which `--exclude-dependencies` does not fully silence for this particular detector. |

## Accepted findings, suppressed with justification

| Detector | Location | Why it is suppressed rather than fixed by rewriting |
|---|---|---|
| `unused-return` | `RatingRegistry.scoreOf` | Originally the Medium finding described above. `scoreOf` discards the first of `WorkerRegistry.statsOf`'s three return values — `(, uint32 ratingCount, uint32 scoreSum) = WORKERS.statsOf(worker);` — because the scoring formula in `previewScoreBps` only ever needs `ratingCount` and `scoreSum`; `registeredAt` is genuinely irrelevant to it, not a mistake. A tuple hole is the idiomatic Solidity way to say that, so the code was kept in that form and the finding suppressed directly with `// slither-disable-next-line unused-return` plus a comment at the call site explaining the discard is deliberate. Not classified as a false positive: `unused-return` is doing exactly its job of flagging a discarded return value, and in most call sites that would be a real defect — it just isn't one here. |

## Known lint baseline in `test/`, not suppressed

`forge build` also reports lint warnings inside `contracts/test/` —
`calls-loop`, `literal-instead-of-constant`, `reentrancy-events`,
`uninitialized-local`, `unsafe-typecast`, and `unused-return` — all arising
from ordinary Foundry test idioms (loops of `vm.prank` + call in attack
simulations, repeated literal scores and weights across assertions, fuzz
inputs, and tuple-skipping on `statsOf`/`platformAt` reads). These are left
unsuppressed on purpose: they are test-only, do not reflect a `src/` bug or
gas cost, and suppressing each one individually would bury the three `src/`
`unsafe-typecast` sites (see below) in noise instead of making them stand
out as the only lint suppressions that matter.

## `src/` timestamp-cast lint suppressions

`forge build` previously reported `warning[unsafe-typecast]` on three
`uint64(block.timestamp)` sites in `src/`: `PlatformRegistry.sol`
(`registerPlatform`), `WorkerRegistry.sol` (`register`), and
`RatingRegistry.sol` (`submitRating`). Each now carries a
`// forge-lint: disable-next-line(unsafe-typecast)` with a comment
explaining that a unix timestamp cannot overflow `uint64` until the year
2554, and that `uint64` is the field width `docs/DATA-MODEL.md` declares —
widening it would break the single-slot packing the gas targets in the
README and `docs/DECISIONS.md` depend on. Verified: `forge build` no longer
reports `unsafe-typecast` anywhere under `src/`.
