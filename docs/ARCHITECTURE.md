# Architecture

## Shape of the system

```
Worker / Client browser
        |
        v
  Next.js app  ---- reads/writes ---->  Base Sepolia
        |                                  |
        |                          PlatformRegistry
        |                          WorkerRegistry
        |                          RatingRegistry
        v
   Postgres (Supabase)
   display names, job titles, comments, cached scores
```

Three contracts hold the record. Postgres holds the text that would be reckless to
publish forever. The web app reads both and stitches them together.

## Split between chain and database

The chain stores what has to be tamper-proof and portable: who rated whom, the
score, which platform vouched for the job, and when. That is it.

Postgres stores everything a person would want deleted later: display names, job
descriptions, free-text comments. It also caches computed scores so the profile
page does not hammer an RPC endpoint on every load.

Each rating carries a `contentHash` on chain. The comment sits in Postgres. Anyone
can hash the stored comment and compare it to the chain, which detects tampering
without publishing the comment itself.

## Reading chain data

Start with direct `viem` reads plus event logs, cached in Postgres by a background
job. Skip a dedicated indexer.

An indexer like The Graph earns its keep at a scale this project will never reach.
Adding one costs a day of setup and buys nothing a reviewer will notice. If read
latency becomes a real problem, revisit it then.

## Sign-in flow

Privy handles Google OAuth and provisions an embedded wallet. The user never sees
a seed phrase and never installs an extension.

This choice matters more than it looks. A demo that opens with "install MetaMask"
loses most visitors in the first five seconds. Every extra step between the link
and the profile costs you a chunk of your audience.

Cost of the choice: a third-party dependency in the auth path, and a reviewer may
ask whether the wallet is truly non-custodial. Have an answer ready.

## Rating flow

A rating only counts when a registered platform vouches for the job. Otherwise
anyone can rate anyone and the whole thing is theater.

```
1. Platform backend signs an attestation:
   { jobId, workerAddress, clientAddress, completedAt, nonce }
   using EIP-712, with the chain id in the domain separator.

2. Client submits the rating plus that signature to RatingRegistry.

3. Contract checks:
   - signer is on the platform allowlist
   - jobId has never been used
   - msg.sender matches clientAddress in the attestation
   - score is between 1 and 5
   - worker is registered

4. Contract stores the rating and emits RatingSubmitted.

5. Indexer job picks up the event, recomputes the cached score, writes to
   Postgres.
```

The nonce and the `jobId` uniqueness check together block signature replay. Skip
either and someone submits the same attestation a thousand times.

## Verification flow

The public profile page runs as a server component. It reads the cached score from
Postgres and the on-chain record in parallel, then renders.

No wallet connection. No sign-in. A verifier who has to connect anything has
already closed the tab.

Every profile links to the block explorer so a skeptical verifier checks the raw
record themselves.

## Chain choice

Base Sepolia, for three reasons: gas costs stay near zero, the tooling works, and
an L2 matches the real use case where a worker might collect hundreds of small
ratings.

An L1 testnet would work for the demo but tell a false story about cost.

## Performance targets

| Path | Target |
|---|---|
| Public profile load | under 1s from cache |
| Rating submission confirmed | under 5s |
| Score recompute after event | under 30s |

## Deployment

- Frontend on Vercel
- Postgres on Supabase
- Contracts deployed by a Foundry script, addresses committed to
  `contracts/deployments/base-sepolia.json`
- Contracts verified on Basescan so a reviewer reads the source without cloning

## What is deliberately missing

Say so in the README. Naming your own gaps reads as judgment, not as an excuse.

- **Upgradeability.** Contracts are immutable. A proxy pattern adds risk and
  complexity for a demo that will never need a migration.
- **Decentralized platform onboarding.** One owner key manages the allowlist.
- **Real cross-platform data.** Seeded demo data stands in for it.
- **Privacy-preserving proofs.** A worker currently reveals their whole history.
  Selective disclosure with a zero-knowledge proof is the natural next step and
  sits outside this scope.
