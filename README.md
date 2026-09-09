# WorkLedger

**Portable work reputation for gig and freelance workers.** A rating earned on one
platform carries to the next instead of resetting to zero.

Runs on Base Sepolia testnet. No token, no real money, no mainnet deployment.

---

## Status

This repository currently contains **milestone 1 of 6: the on-chain layer.**
The contracts are finished and tested. Nothing is deployed yet, and the web
interface described in `docs/` has not been built.

| | |
|---|---|
| Contracts | 3, immutable, no proxies, no upgrade path |
| Test suite | **67 passing** — happy paths, every revert path, fuzz, and 11 attack scenarios |
| Static analysis | Slither: **0 medium or high** findings ([notes](contracts/slither-notes.md)) |
| Deployed to testnet | Not yet — milestone 2 |
| Web app | Not yet — milestones 3 and 4 |

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for what ships in which milestone.

## The problem

A courier with four years of five-star deliveries switches apps and appears as a
brand new account. The platform owns the rating data, so the worker cannot take
it with them.

Three consequences follow. Workers get locked in, because leaving costs them the
reputation they built. Workers who do switch earn less for months while they
climb back up. And clients on the new platform cannot tell a proven worker from
an unknown one.

## Why a blockchain — and when it isn't the answer

Competing platforms have no reason to trust each other's rating data, and none of
them will let a rival host it. A public chain removes the question of who holds
the database.

> If a single trusted intermediary existed, a shared REST API would beat this
> design and no blockchain would be needed. This design exists only because
> competing platforms have no incentive to trust each other or to let a rival
> host the data. Where that assumption fails, the simpler design wins.

That trade-off is stated here rather than buried, because it is the first
question the design should have to answer.

## How it works

```
Client                 Platform backend              WorkLedger contracts
  |                          |                                |
  |-- finishes a job ------->|                                |
  |                          |-- signs EIP-712 attestation    |
  |<-- attestation ----------|   { jobId, worker, client,      |
  |                          |     completedAt, nonce }        |
  |                                                            |
  |-- submitRating(attestation, signature, score, hash) ------>|
  |                                                            |
  |                              PlatformRegistry: is the signer allowlisted?
  |                              WorkerRegistry:   is the worker registered?
  |                              RatingRegistry:   store, bump stats, emit
```

**A rating counts only when a registered platform has signed an attestation that
the job happened.** That single rule blocks the obvious attack — an attacker
spinning up a thousand addresses to rate themselves — because creating addresses
is free but convincing a real platform to sign for a job that never happened is
not.

**Fresh accounts start at 3.0, not at zero.** A Bayesian prior of 3.0 stars with
a weight of 5 sits below the roughly 4.6 average of a real rating pool, so
abandoning a history and registering a new address costs the worker instead of
paying off. It also stops a single 5-star rating from producing a perfect
profile: one rating reads as 3.33, which is "unproven" rather than "flawless".

```
scoreBps = (scoreSum × 10000 + PRIOR_WEIGHT × PRIOR_SCORE_BPS)
           ────────────────────────────────────────────────────
                        ratingCount + PRIOR_WEIGHT
```

The constants are `immutable` and set in the constructor, so not even the owner
can rewrite anyone's score.

## What is on chain, and what is not

**On chain:** addresses, scores, timestamps, platform ids, content hashes.

**Off chain:** names, job titles, rating comments.

Chain data cannot be deleted, so personal data landing there is a permanent leak
and none of it goes there. Each rating carries a `contentHash` on chain while the
comment itself lives in Postgres — anyone can hash the stored comment and compare
it to the chain, which detects tampering without publishing the comment.

## Security

The threat model is the part of this project worth reading. Full version in
[`docs/SECURITY.md`](docs/SECURITY.md); the contracts hold no funds, which
removes most of the classic exploit surface.

| Attack | Defense | Test |
|---|---|---|
| Sybil — many addresses rating one worker | Only allowlisted platforms may attest | 100 unattested ratings, all revert |
| Whitewashing — abandoning a bad history | Bayesian prior puts a fresh account below the pool average | Both directions asserted, including the case it does *not* solve |
| Signature replay | `jobId` is the storage key; nonce tracked per platform | Same attestation submitted 50 times |
| Cross-chain / cross-deployment replay | Chain id and verifying contract in the EIP-712 domain separator | Foreign domain separator rejected |
| Deactivated platform | Allowlist checked at submission, not at signing | Prior ratings stay valid, new ones rejected |
| Score inflation via the owner key | Scoring constants are `immutable` | Every reachable write path exercised |

## Gas

Measured with `forge test --gas-report`; the full report is committed at
[`contracts/gas-report.txt`](contracts/gas-report.txt).

| Function | Cost | Target | |
|---|---|---|---|
| `register` | 45,021 | under 50k | meets |
| `submitRating` | 145,190 | under 120k | **misses by ~21%** |
| `scoreOf` | free off-chain | view | 6,586 when called by a contract |

`submitRating` misses its target and was not optimized to fit. The write is
structurally four cold storage slots — three for the `Rating` struct plus one for
the per-platform nonce — which is 80,000 gas of irreducible floor before any
logic runs, on top of a cross-contract stats update, three cross-contract reads,
and ECDSA recovery. Every available optimization would break something the design
requires: dropping a `Rating` field contradicts the data model, and dropping the
nonce weakens the replay defense. The reasoning is recorded in
[`docs/DECISIONS.md`](docs/DECISIONS.md).

Note that `submitRating`'s *average* in the raw report is around 68,500, which is
misleading — most recorded calls are reverting ones from the revert suite and the
100-attacker Sybil loop, which fail cheaply. The max is the number that matters,
because it is the one call that actually writes a rating.

## Known limits

Stated openly, because a design that names its own gaps is easier to trust.

- **One owner key controls the platform allowlist.** This is not decentralized.
  The allowlist moves the trust boundary rather than removing it.
- **A compromised platform *signing* key forges ratings outright.** A different
  key with a different blast radius than the owner key above, and the test suite
  asserts it deliberately: attestations signed with a stolen platform key all
  succeed.
- **A worker sitting well below the prior still gains by resetting** their
  address. Closing this needs one-account-per-person, which needs either a
  central identity check or a zero-knowledge uniqueness proof. Neither is built.
- **Collusion detection is partial.** Catching a ring of clients and workers
  rating each other properly needs graph analysis on real traffic.
- **A worker reveals their whole history to a verifier.** Selective disclosure
  with a zero-knowledge proof is the natural next step and sits outside this
  scope.
- **Contracts are immutable.** No proxy, no migration path. Deliberate for a
  project this size, but it means a bug ships permanently.

## Running locally

Requires [Foundry](https://getfoundry.sh). Clone with submodules, since
`forge-std` and OpenZeppelin are pinned as submodules:

```bash
git clone --recurse-submodules https://github.com/Nuzzy32/WorkLedger.git
cd WorkLedger/contracts
forge test
```

Expect 67 passing tests. For the gas breakdown:

```bash
forge test --gas-report
```

There is no `web/` directory yet — the frontend is milestone 3.

## Repository layout

```
contracts/
  src/         PlatformRegistry, WorkerRegistry, RatingRegistry
  test/        6 suites: unit, revert paths, fuzz, attack scenarios
docs/          Specs, threat model, and the decision log
```

## Docs

| File | Contents |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Problem, users, features, scope |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System shape and trade-offs |
| [`docs/CONTRACTS.md`](docs/CONTRACTS.md) | Interfaces, validation order, scoring rule |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | On-chain structs and Postgres schema |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Threat model |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Where the contracts deviate from the specs, and why |
| [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) | Tokens and components for the unbuilt frontend |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Milestones |
| [`contracts/slither-notes.md`](contracts/slither-notes.md) | Static-analysis run and accepted findings |

Contracts are MIT licensed per their SPDX headers.
