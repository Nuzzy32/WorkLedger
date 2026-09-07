# PortaRep

Portable reputation for gig and freelance workers. Ratings earned on one platform
carry to another instead of resetting to zero.

Runs on Base Sepolia testnet. No real money, no token.

> Rename the project before you publish. `PortaRep` is a placeholder.

## The problem

A courier with four years of five-star deliveries switches apps and appears as a
brand new account. The platform owns the rating data, so the worker cannot take it
with them. Switching costs them months of lower earnings, and the new platform
cannot tell a proven worker from an unknown one.

## Why a blockchain

Competing platforms have no reason to trust each other's rating data, and none of
them will let a rival host it. A public chain removes the question of who holds the
database.

If one trusted intermediary existed, a shared REST API would beat this design.
Where that assumption holds, the simpler design wins.

## How it works

A rating counts only when a registered platform signs an attestation that the job
happened. That single rule blocks the obvious attack, which is an attacker
spinning up a thousand addresses to rate themselves.

Fresh accounts start at 3.0 rather than at a neutral zero, which sits below the
pool average. Abandoning a bad history for a new address therefore costs the
worker instead of paying off.

## What is on chain and what is not

On chain: addresses, scores, timestamps, platform ids, content hashes.

Off chain: names, job titles, comments.

Chain data cannot be deleted. Personal data that lands there is a permanent leak,
so none of it goes there.

## Known limits

- One owner key controls the platform allowlist. Not decentralized.
- A worker sitting very low still gains by resetting their address. Closing this
  needs one-account-per-person, which needs either a central identity check or a
  zero-knowledge uniqueness proof. Neither is built.
- Collusion detection is partial. Catching it properly needs graph analysis on
  real traffic.
- A worker reveals their full history to a verifier. Selective disclosure is the
  natural next step.
- Rating data is seeded, not pulled from a live platform.

## Stack

Solidity 0.8.24, Foundry, Base Sepolia, Next.js 15, TypeScript, Tailwind v4,
viem, wagmi, Privy, Supabase.

## Docs

| File | Contents |
|---|---|
| `docs/PRD.md` | Problem, users, features, scope |
| `docs/ARCHITECTURE.md` | System shape and trade-offs |
| `docs/DATA-MODEL.md` | On-chain structs and Postgres schema |
| `docs/CONTRACTS.md` | Interfaces, checks, scoring rule |
| `docs/SECURITY.md` | Threat model |
| `docs/DESIGN-SYSTEM.md` | Tokens and components |
| `docs/ROADMAP.md` | Milestones |

## Running locally

```bash
# contracts
cd contracts
forge install
forge test
forge test --gas-report

# web
cd web
pnpm install
cp .env.example .env.local
pnpm dev
```

## Gas

Fill in from `forge test --gas-report` once M1 lands.

| Function | Gas |
|---|---|
| `register` | |
| `submitRating` | |
