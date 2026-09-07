# Roadmap

Build in this order. Each milestone leaves the repo in a demoable state.

## M1: Contracts

- Foundry project, Solidity 0.8.24
- `PlatformRegistry`, `WorkerRegistry`, `RatingRegistry`
- EIP-712 attestation verification
- Bayesian scoring with immutable constants
- Full test suite including the five attack scenarios in `docs/CONTRACTS.md`
- `slither .` clean at medium and above
- Gas report saved to `contracts/gas-report.txt`

**Done when** `forge test` passes and the Sybil test proves 100 unattested
ratings all revert.

Start here. The contracts define the data shape, and building the UI first means
rewriting it.

## M2: Deploy and seed

- Deploy script for Base Sepolia
- Addresses committed to `contracts/deployments/base-sepolia.json`
- Source verified on Basescan
- Supabase schema applied
- Seed script generating 3 platforms, 40 workers, 600 ratings

**Done when** a stranger reads a worker's score straight off Basescan.

## M3: Public verification page

- Route `/w/[address]`
- Server component, no wallet, no login
- `ScoreBadge`, `RatingDistribution`, `PlatformChip`, `AddressDisplay`
- All four states designed
- Block explorer link
- QR code generation

**Done when** you open the page on a phone with no wallet installed and it loads
under a second.

Ship this before the worker dashboard. It is the screen that makes people
understand the project, and it needs the most polish.

## M4: Auth and worker dashboard

- Privy Google sign-in with embedded wallet
- `register()` on first sign-in
- Dashboard listing received ratings
- Score breakdown showing the formula inputs
- Share link and QR code

**Done when** you sign in with a Google account that has never touched crypto and
reach your profile in under 60 seconds.

## M5: Rating submission

- Mock platform backend signing EIP-712 attestations
- Client rating form, 1 to 5 plus optional comment
- Comment to Postgres, hash on chain
- Event listener recomputing the cached score
- Rate limiting on API routes

**Done when** you submit a rating end to end and watch the score move.

## M6: Polish and write-up

- README with the honest framing from `docs/PRD.md`
- Architecture diagram
- Threat model summary linking to `docs/SECURITY.md`
- Gas numbers in a table
- Screenshots or a short recording
- Deployed to Vercel

**Done when** someone who has never seen the repo understands the point from the
README alone.

## Not in scope

Revisit only after M6 ships:

- Rating decay
- Rater weighting
- Dispute flags
- Selective disclosure with zero-knowledge proofs
- The Graph indexer
- Contract upgradeability

## Where this usually goes wrong

The failure mode is not running out of skill. It is drifting into an
almost-finished state where nothing is demoable.

Two rules keep that from happening:

1. Finish M3 before touching M4. A deployed public verification page with seeded
   data already reads as a real project. A half-built dashboard reads as nothing.
2. Deploy at the end of every milestone. A local-only project cannot be shown to
   anyone, and the demo link is what recruiters actually click.
