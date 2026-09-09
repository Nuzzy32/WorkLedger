# PortaRep

Portable reputation for gig and freelance workers. Ratings earned on one platform
carry to another instead of resetting to zero.

Runs on Base Sepolia testnet. No real money, no token.

> Rename the project before you publish. `PortaRep` is a placeholder. The name
> is also the EIP-712 domain `RatingRegistry` signs attestations under, so
> renaming it changes the domain separator: every attestation signed before
> the rename stops verifying, and `RatingRegistry` must be redeployed.

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
- A compromised platform *signing* key forges ratings outright — a different
  key with a different blast radius than the owner key above. `contracts/test/Attacks.t.sol`
  tests this deliberately: attestations signed with a stolen platform key all
  succeed.
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
| `docs/DECISIONS.md` | Where the contracts, tests, and docs deviate from each other, and why |
| `contracts/slither-notes.md` | Static-analysis run and findings |

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

From `contracts/gas-report.txt` (`forge test --gas-report`).

| Function | Min | Avg | Median | Max |
|---|---|---|---|---|
| `register` | 23,461 | 44,949 | 45,021 | 45,021 |
| `submitRating` | 24,588 | ~68,500 | 27,016 | 145,190 |
| `scoreOf` | 6,586 | 6,586 | 6,586 | 6,586 |

`submitRating`'s avg and median are not the real cost. Of the 1,067 recorded
calls, most are *reverting* calls from the revert suite and the 100-attacker
Sybil loop, which fail cheaply and drag the average down to around 68,500 (it
also shifts slightly between runs, since one fuzz test's random content hash
occasionally lands on zero, which is cheaper to store than a real hash). The
number that matters is the **max, 145,190** — the one call that actually
writes a rating, and it is stable run to run because every field it stores is
non-zero. `register` meets the `docs/CONTRACTS.md` target of under 50k.
`submitRating` does not: at 145,190 it misses the under-120k target by about
21%. The write is structurally four cold storage slots — three for the
`Rating` struct plus one for the per-platform nonce — which is 80,000 gas of
irreducible floor before any logic runs, on top of a cross-contract stats
update, three cross-contract reads, and ECDSA recovery. See
`docs/DECISIONS.md` for the full reasoning on why this was accepted rather
than optimized away.

`scoreOf`'s `docs/CONTRACTS.md` label of "view, free" is correct for an
off-chain `eth_call`, where a view function costs nothing. The 6,586 figure
above is what it costs when another contract calls it on chain instead.
# WorkLedger
