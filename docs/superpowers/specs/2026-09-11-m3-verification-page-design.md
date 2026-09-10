# M3: public verification page

Design for milestone 3 of `docs/ROADMAP.md`: the route `/w/[address]`, the
first screen of this project a stranger can open.

## Goal

A verifier opens a link, sees whether a worker's claimed history is real, and
leaves. No account, no wallet, no sign-in, no explanation of what a blockchain
is. `docs/PRD.md` sets the bar at an answer within three seconds;
`docs/ARCHITECTURE.md` sets the profile load target at under one second from
cache.

Done when the page opens on a phone with no wallet installed and loads under a
second.

## Scope

In:

- Route `/w/[address]`, server-rendered, no wallet and no login
- `VerificationResult`, `ScoreBadge`, `RatingDistribution`, `PlatformChip`,
  `RatingList`, `AddressDisplay`, `ProfileQr`
- All four states from `docs/DESIGN-SYSTEM.md`: loading, empty, error, partial
- Block explorer link, chain-aware
- QR code encoding the page's own URL

Out, with the reason:

- **Score breakdown and "how many more jobs raise my score".**
  `RatingRegistry.previewScoreBps()` is public precisely so the UI never
  reimplements the formula, but `docs/ROADMAP.md` places the breakdown in M4
  alongside the worker dashboard.
- **Per-rating comment hash verification.** Checking a stored comment against
  its on-chain `contentHash` costs one `ratingOf` call per row. Fifty RPC round
  trips contradict the sub-second target, and the claim in
  `docs/ARCHITECTURE.md` is that anyone *can* perform the check, not that the
  page performs it on every load.
- **Client addresses.** The page never renders one. `docs/DECISIONS.md` entry L
  is honest that the `jobId -> client` linkage is already public on chain, so
  this is a display choice rather than a privacy guarantee, and it is the
  display choice the schema's column grants were written to match.
- **Auth, rating submission, dashboard.** M4 and M5.

## Data sources

Two reads, in parallel, per `docs/ARCHITECTURE.md`.

### Chain, via viem

Contract addresses come from `contracts/deployments/<network>.json`, the file
the deploy script already writes.

| Call | Returns | Used for |
|---|---|---|
| `WorkerRegistry.isRegistered(address)` | `bool` | separating "not found" from "no ratings yet" |
| `WorkerRegistry.statsOf(address)` | `registeredAt`, `ratingCount`, `scoreSum` | count, registration date, unproven threshold |
| `RatingRegistry.scoreOf(address)` | `scoreBps` | the displayed score |

`PlatformRegistry.platformAt(platformId)` is read once per distinct platform in
the worker's history — at most three, since the demo seeds three platforms. It
carries the active flag, and `docs/DATA-MODEL.md`'s `platforms` table has no
`active` column on purpose: whether a platform may still issue attestations is
the chain's answer, not the cache's. These reads depend on the database result
for the platform ids, so they form a second round rather than joining the first
`Promise.all`.

Four call kinds, not one batch. No multicall: a plain
anvil has no Multicall3 deployed, and adding a batching layer for three calls
optimises a latency problem that has not appeared yet. Revisit if Base Sepolia
RPC latency shows up in the numbers.

The score is `scoreBps / 10000`, rendered to two decimals with
`font-variant-numeric: tabular-nums`. It is never rendered without the rating
count beside it: a 5.00 from one job and a 4.70 from three hundred must not
look alike, and that gap is the whole point of the project.

### Postgres, via `@supabase/supabase-js` with the anon key

`seed/sql/001_schema.sql` was written for anonymous reads and this page is the
reader it was written for. RLS is enabled on all four tables with
`for select using (true)` on `platforms`, `workers`, and `ratings`;
`ratings.client` is revoked at column level from both `anon` and
`authenticated`; `sync_state` has neither a policy nor a grant.

Consequences that make this the right client:

- No database password reaches the web app or its deployment environment. The
  publishable anon key plus RLS is the whole credential.
- The column grant becomes a real defence rather than decoration: the page
  cannot read `ratings.client` even if a future component asks for it.
- `postgres.js` with `DATABASE_URL`, the client `seed/` uses, would need the
  service role's reach to do less.

One query, not three. `ratings` joins `platforms` through the existing foreign
key, and every rating row for the worker is fetched — tens of rows, not
thousands, since the seed spreads 600 ratings across 40 workers. The
distribution is computed from that set and the ten most recent are sliced for
the list. Fetching only ten rows would make the distribution wrong.

The `workers` row supplies `display_name`, `headline`, `cached_score`,
`cached_count`, and `cached_at`.

## State machine

| Condition | State | Treatment |
|---|---|---|
| `isAddress()` fails, or not registered and no worker row | **Not found** | Plain, no alarm. An unknown address is not a fraud signal. |
| Registered, `ratingCount` = 0 | **Empty** | Explains what would appear here and where ratings come from. |
| Registered, `ratingCount` < 10 | **Unproven** | Amber ring, icon, and the label. Score shown, plus a line saying the sample is small. |
| Registered, `ratingCount` >= 10 | **Verified** | Green ring, icon, label, and the `cached_at` timestamp. |
| Chain read fails, worker row present | **Partial** | Cached score with a subtle staleness indicator, not a blocked page. |
| Database read fails, chain healthy | Aggregates render; the distribution and list carry their own error state | The score is the chain's, so a database outage must not hide it. |
| History contains a deactivated platform | Neutral ring on `ScoreBadge` plus a footnote, and the chip renders in `danger` | Per `docs/DESIGN-SYSTEM.md`. Neither verified nor unproven: the ratings stand, but one issuer no longer does. |

An invalid address short-circuits before either read. It renders Not found
rather than throwing, because a mistyped link is the common case and an error
page reads as an accusation.

Amber is load-bearing here. A new account is neither trustworthy nor
suspicious, and the UI has to say so without picking a side. Colour never
carries a state alone: every one of these pairs a colour with an icon and a
text label, so the meaning survives a grayscale screenshot and a colourblind
reviewer.

## Files

```
web/
  app/
    globals.css              @theme tokens from docs/DESIGN-SYSTEM.md
    layout.tsx               Inter + JetBrains Mono, content capped at 1120px
    w/[address]/
      page.tsx               server component, the two parallel reads
      loading.tsx            skeletons matching the final layout
      error.tsx              what failed, plus a retry
  components/
    VerificationResult.tsx   hero: verified / not found / unproven
    ScoreBadge.tsx           number, count, ring, label
    RatingDistribution.tsx   horizontal bars, 1 through 5
    PlatformChip.tsx         platform name, active or inactive (no logo, see below)
    RatingList.tsx           ten most recent: job title, platform, date, score, comment
    AddressDisplay.tsx       truncated middle, mono, click to copy
    ProfileQr.tsx            server-rendered SVG of the page's own URL
  lib/
    chain.ts                 viem client, contract reads, explorer URLs
    db.ts                    supabase client and the profile query
    score.ts                 bps conversion, state decision, distribution
    address.ts               validation and normalisation
```

`AddressDisplay` is the only `"use client"` file in the milestone, because
click-to-copy needs the clipboard API. Everything else is a server component,
which is both the `CLAUDE.md` default and the reason the page needs no
JavaScript to display its content.

Addresses are stored and queried lowercase, per `docs/DATA-MODEL.md`, and
displayed checksummed.

## Explorer links

`lib/chain.ts` exposes `explorerTxUrl(hash)` and `explorerAddressUrl(address)`,
both returning `null` on chain id 31337. On anvil the UI renders the hash in
monospace with no link. A dead link to Basescan is worse than no link, and the
verifier who wants to check the raw record is exactly the person a broken link
insults.

## Language and vocabulary

English UI. The repository, docs, and README are English throughout, and
multi-language UI is out of scope in `docs/PRD.md`.

The words blockchain, wallet, gas, and token appear nowhere in this page. The
footer and the developer docs are where they belong. The page reads as a
credentials check: a bank statement, a lab result, a background check.

## Responsive and accessible

Mobile first, because a verifier arrives by scanning a QR code with a phone.
Breakpoints stop at `lg`. Content capped at 1120px. Card padding 16px on
mobile and 24px above it. Spacing comes from the 4px scale only.

Amber on white fails contrast easily, so the amber text tone is checked against
4.5:1 rather than assumed. Every interactive element keeps a visible focus
ring, standalone icons carry `aria-label`, and tap targets stay at 44px.

Motion is 150ms on hover and focus and nothing else. No animated score
counter: the number is a fact, not a reveal.

## Testing

`node --test --import tsx`, matching `seed/`. No vitest, no browser tests.

Pure functions carry the logic worth testing:

- `score.ts`: bps to two-decimal display, including the truncation the contract
  performs; the state decision across every row of the table above, including
  both failure rows; distribution counts from a rating set.
- `address.ts`: valid, invalid, mixed-case, and checksum-failing input.
- `db.ts`: the row-to-view mapping, so a schema change surfaces as a failing
  test rather than a blank card.

Every state in the table needs a test, since the states are the deliverable
that separates this from a demo screenshot.

## Development environment

Local anvil plus the existing Supabase project. Base Sepolia is deferred: the
faucets that fund a fresh wallet gate on either phone verification or a mainnet
ETH balance, and both gates are currently closed. The pipeline is proven
against anvil and waits on nothing but a balance.

Two conditions hold while the data is anvil's:

1. Anvil-derived rows are removed from Postgres before the real Base Sepolia
   run. The chain seed is idempotent; the database is not the place to stack
   two histories.
2. The page is not deployed publicly while it serves anvil data, because the
   transaction hashes point at a chain that no longer exists. The sub-second
   phone target is verified over the local network instead.

Whether the seed writes those rows through `writeAll` and `DATABASE_URL` or
through the Supabase MCP connection is an execution decision, not a design one.
Only the first exercises the untested write path recorded in the README.

## Two gaps in the seeded data

Neither blocks the milestone; both are named so a reviewer does not read them
as oversights.

`seed/src/db.ts` writes platforms as `id` and `name` only, so `logo_url` is
null for all three. `PlatformChip` renders the name alone. The component takes
a logo the moment the column has one; nothing about M3 depends on it.

The seed never calls `PlatformRegistry.deactivatePlatform`, so no seeded worker
has a deactivated issuer in their history. The neutral-ring path is implemented
and unit-tested, but no demo profile exercises it. Deactivating one seeded
platform would make that state visible in the demo, and it is a change to M2's
seed rather than to this page — the project owner's call, not this task's.

## Deliberate simplifications

- Three `eth_call`s rather than a multicall batch.
- Every rating row fetched for one worker rather than a SQL aggregate for the
  distribution. Correct at tens of rows; revisit at thousands.
- No revalidation strategy beyond the framework default while the chain is
  local. Base Sepolia latency is the trigger to choose one.
