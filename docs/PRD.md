# PRD: WorkLedger

## The problem

A courier with four years of five-star deliveries switches apps and shows up as a
brand new account. Same person, same skill, zero history. The platform holds the
rating data, so the worker cannot take it anywhere. Three things follow from that:

- Workers get locked in. Leaving costs them the reputation they built.
- Workers who do switch earn less for months while they climb back up.
- Clients on the new platform cannot tell a good worker from an unknown one.

## Who this is for

**Worker.** Freelancer, courier, or driver who works across more than one
platform. Wants ratings that follow them.

**Client.** Hires a worker and rates the finished job. Wants their rating to
actually count.

**Verifier.** A new platform or a direct client checking whether someone's claimed
history is real. Opens a link, sees a result. Never signs up, never installs a
wallet, never learns what a blockchain is.

## What success looks like

For a portfolio, the number that matters is whether a stranger understands the
project. Concretely:

- A verifier gets an answer in under 3 seconds from opening the link
- A worker signs in and sees their profile in under 60 seconds, having never used
  a crypto wallet
- Submitting a rating costs under $0.01 in testnet gas terms
- A visitor who knows nothing about crypto can explain the point after reading the
  README

## User stories

### Worker

- I sign in with Google and get a wallet without seeing a seed phrase
- I see every rating I have received and which platform issued it
- I generate a share link and a QR code for my profile
- I see one number that summarizes my standing, and I can read how it was computed
- I see how many more jobs raise my score to the next band

### Client

- I rate a finished job from 1 to 5 with an optional comment
- I cannot rate a job that did not happen
- I cannot rate the same job twice

### Verifier

- I open a worker's link and see their score, job count, and rating spread
- I see which platforms issued the ratings and when
- I see a warning when the profile is too new to judge
- I check the raw record on a block explorer if I want to
- I do all of this without an account

## Features by priority

### Must have (v1)

| Feature | Note |
|---|---|
| Google sign-in with embedded wallet | Kills the biggest drop-off point |
| Worker profile page | Score, job count, distribution, platform breakdown |
| Rating submission | Client rates a completed job |
| Job attestation | A registered platform signs that the job happened |
| Public verification page | No login, works from a QR code |
| Platform allowlist | Only registered platforms may issue attestations |
| Sybil and whitewashing defenses | See `docs/SECURITY.md` |
| Score breakdown view | Shows the inputs, not just the number |

### Should have (v2)

- Rating decay so old ratings weigh less
- Rater weighting by the rater's own standing
- Dispute flag on a rating
- Simulated multi-platform demo with seeded data

### Out of scope

Do not build these:

- Job marketplace or matching
- Payments, escrow, wallets holding value
- Chat or notifications
- Mobile app
- Any token
- Integration with a real platform's API
- Multi-language UI

## Constraints

- Runs on Base Sepolia. Never mainnet.
- No real personal data. Demo profiles use fictional names.
- Rating data comes from a seed script, not from a live platform.
- One admin key controls the platform allowlist. The README states this openly
  rather than claiming full decentralization.

## Honest framing for the README

Write this in the README, not buried in a doc:

> A single trusted intermediary could solve this with a shared REST API and no
> blockchain. This design exists because competing platforms have no incentive to
> trust each other or to let a rival host the data. Where that assumption fails,
> the simpler design wins.

A reviewer who sees you name the limits of your own design trusts everything else
you wrote.
