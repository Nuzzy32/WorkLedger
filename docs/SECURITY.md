# Threat model

This file is the reason the project is worth showing to anyone. Most reputation
demos skip it.

## Attacks on the reputation layer

### Sybil

An attacker creates many addresses and uses them to rate their own worker account
into the top band.

**Defense.** A rating only counts with a valid attestation signed by an allowlisted
platform. Creating addresses stays free. Creating jobs does not, since the
attacker would have to convince a real platform to sign for a job that never
happened.

**Residual risk.** Compromise a platform signing key and this collapses. Say so.
The allowlist moves the trust boundary rather than removing it.

### Whitewashing

A worker with bad ratings abandons the address and registers a new one.

**Defense.** The Bayesian prior puts a fresh account at 3.0, below the pool
average. Walking away from a 2.8 profile lands you at 3.33 after one 5-star job
but with a job count of 1, and the UI marks low-count profiles as unproven.

**Residual risk.** A worker sitting at 2.0 with 50 jobs still gains by resetting.
Fully closing this needs identity binding, which means one account per person,
which means either a central identity check or a zero-knowledge uniqueness proof.
Both sit outside this scope. Write it in the README as known and unsolved.

### Collusion and ballot stuffing

A ring of clients and workers rate each other highly on fake jobs.

**Defense in v1.** Platform attestation raises the cost. Only partial.

**Defense in v2.** Weight a rating by the rater's own standing and flag pairs who
rate each other repeatedly.

**Residual risk.** Detecting collusion properly needs graph analysis on real
traffic. Not solvable in a demo. State the limit.

### Bad-mouthing

A competitor submits low ratings to damage a worker.

**Defense.** The rating requires a real job attestation, so the attacker has to be
an actual client on a real job. The rating spread shows on the profile, so one
outlier does not hide inside an average.

### Signature replay

An attestation reused to submit the same rating many times, or a signature from
one network replayed on another.

**Defense.** `jobId` is the storage key, so a second submission has nowhere to go.
The nonce is tracked per platform. The chain id sits in the EIP-712 domain
separator.

This is the one that gets built wrong most often. Test it.

### Score inflation through the owner key

The owner changes the prior constants and rewrites everyone's score.

**Defense.** Constants are `immutable`, set in the constructor. The owner cannot
touch them.

## Contract-level risks

| Risk | Mitigation |
|---|---|
| Access control gaps | `Ownable` for the registry, deployer-set once for stats updates, tested |
| Integer truncation | Scale to basis points before dividing, pinned tests |
| Unbounded loops | No arrays that grow with rating count, aggregates only |
| Reentrancy | `submitRating` calls `WORKERS` and `PLATFORMS`, but both are immutable, in-repo contracts that make no outbound calls of their own, and all state is written before either call runs |
| Front-running | Nothing to gain by ordering a rating, no economic value at stake |
| Denial of service via gas | Fixed-cost writes regardless of history size |

No contract holds funds. That removes most of the classic exploit surface, and the
README should point it out.

## Web application risks

Follow OWASP basics. Nothing exotic.

- **Input validation.** Validate every API input with Zod. Never trust a body.
- **XSS.** Rating comments come from users. Render as text, never as HTML. No
  `dangerouslySetInnerHTML` anywhere in this repo.
- **SQL injection.** Parameterized queries only. No string concatenation into SQL.
- **Row-level security.** Enable RLS on Supabase. A worker updates only their own
  profile row.
- **Rate limiting.** Cap writes per address on API routes. Otherwise one script
  fills the database.
- **Secrets.** Server-only env vars stay out of anything prefixed
  `NEXT_PUBLIC_`. Check this before every deploy.
- **Error handling.** Return a generic message to the client and log the detail
  server-side. Stack traces in a response hand an attacker a map.

## Privacy

- No personal data on chain. Enforced by review, since nothing technical stops it.
- Comments live off chain and stay deletable.
- The public profile shows a score, a count, a distribution, and platform names.
  It does not show client addresses in a way that links a client to a specific
  comment. See `docs/DECISIONS.md` entry L for how far this guarantee actually
  reaches.
- Demo data uses fictional people.

## Pre-push checklist

Run through this every time:

```
[ ] git status shows no .env, no keys, no .claude/
[ ] git diff reviewed for pasted secrets
[ ] forge test passes
[ ] slither . has no medium or high findings
[ ] no new NEXT_PUBLIC_ var holding a secret
[ ] no console.log with user data
```
