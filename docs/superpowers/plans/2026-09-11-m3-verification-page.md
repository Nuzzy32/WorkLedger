# M3 Verification Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public route `/w/[address]`, a server-rendered worker verification page that needs no wallet, no login, and no JavaScript to display its content.

**Architecture:** One server component reads the chain (viem) and Postgres (supabase-js, anon key) in parallel, then a second short round reads each platform's active flag from the chain once the database has named the platform ids. The chain is the authority for the score, the rating count and issuer status; Postgres supplies the shape and the text. Pure functions in `web/lib` carry every decision worth testing.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Tailwind CSS v4, viem 2.21.55, @supabase/supabase-js, qrcode. Tests run on `node --test --import tsx`, matching `seed/`.

**Spec:** `docs/superpowers/specs/2026-09-11-m3-verification-page-design.md`

## Global Constraints

- TypeScript strict. No `any`. No non-null assertion without a comment saying why the value cannot be null. `noUncheckedIndexedAccess` is on, matching `seed/tsconfig.json`.
- Server components by default. `"use client"` appears in exactly two files this milestone: `components/AddressDisplay.tsx` (clipboard) and `app/w/[address]/error.tsx` (error boundaries must be client components).
- Files: `kebab-case.ts` for modules, `PascalCase.tsx` for components.
- The words **blockchain, wallet, gas, token** never appear in this UI. Footer and developer docs only.
- Colors come only from the `@theme` tokens in `app/globals.css`. Never color alone for state: always color plus an icon plus a text label.
- Spacing from the 4px scale only: 4, 8, 12, 16, 24, 32, 48, 64. Card padding 16px mobile, 24px above. Section gap 48px.
- Breakpoints stop at `lg` (1024). Content capped at 1120px. Mobile first.
- Addresses lowercase in every query, checksummed in every display (`docs/DATA-MODEL.md`).
- Score is never rendered without its rating count beside it.
- Motion: 150ms on hover and focus, nothing else. No animated score counter. Respect `prefers-reduced-motion`.
- Tap targets 44px minimum. Visible focus ring on every interactive element. `aria-label` on standalone icons.
- UI language: English.
- Six dependencies are approved for `web/`: `next`, `react`/`react-dom`, `tailwindcss` + `@tailwindcss/postcss`, `viem`, `@supabase/supabase-js`, `qrcode`. Anything else needs the project owner's approval first (`CLAUDE.md`).
- Commits: `type(scope): subject`, lowercase, imperative, under 72 characters. No AI attribution anywhere — not in the message, not in a trailer, not in a code comment.
- `viem` is pinned to `2.21.55` to match `seed/package.json`. One viem version across the repo means one set of behaviours to reason about.

**Two traps that will produce a wrong page if forgotten:**

1. `RatingRegistry.scoreOf()` returns the **prior baseline** for an address that has never registered, not zero. The deploy script sets `PRIOR_SCORE_BPS = 30_000` and `PRIOR_WEIGHT = 5`, so a stranger's address reads back as a confident `3.00`. Every score display is gated on `isRegistered` being true.
2. `PlatformRegistry.Platform` stores `nameHash`, a `bytes32`, not a name. Platform display names exist only in Postgres. The chain answers `active`; it cannot answer "what is this platform called".

---

### Task 1: Scaffold `web/` with the design tokens

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/tsconfig.test.json`, `web/next.config.ts`, `web/postcss.config.mjs`, `web/next-env.d.ts` (generated), `web/.env.example`
- Create: `web/app/globals.css`, `web/app/layout.tsx`, `web/app/page.tsx`
- Modify: `.gitignore` (nothing to add — `node_modules/`, `.next/`, `.env.*` are already covered; confirm only)

**Interfaces:**
- Consumes: nothing.
- Produces: the `web/` project every later task builds in; the npm scripts `dev`, `build`, `typecheck`, `test`; the CSS custom properties `--color-bg`, `--color-surface`, `--color-border`, `--color-fg`, `--color-fg-muted`, `--color-accent`, `--color-accent-weak`, `--color-verified`, `--color-caution`, `--color-danger`, and the font variables `--font-sans`, `--font-mono`.

- [ ] **Step 1: Create the package manifest**

`web/package.json`:

```json
{
  "name": "workledger-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "TSX_TSCONFIG_PATH=./tsconfig.test.json node --test --import tsx test/*.test.ts",
    "test:chain": "TSX_TSCONFIG_PATH=./tsconfig.test.json node --test --import tsx test/*.anvil.test.ts"
  },
  "dependencies": {
    "next": "^15.5.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "viem": "2.21.55",
    "@supabase/supabase-js": "^2.45.0"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "tsx": "^4.19.2",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "@types/node": "^22.9.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

`qrcode` is deliberately absent — it arrives in Task 10, the task that needs it.

`web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["dom", "dom.iterable", "ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "incremental": true,
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`web/tsconfig.test.json` — Next requires `"jsx": "preserve"`, which leaves JSX untransformed and unrunnable under `node --test`. The test runner gets its own config, and `TSX_TSCONFIG_PATH` in the `test` script points tsx at it:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "types": ["node"]
  },
  "include": ["lib", "components", "test"]
}
```

`web/next.config.ts`:

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default nextConfig
```

`web/postcss.config.mjs`:

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

`web/.env.example`:

```
# Chain to read. 31337 is anvil, 84532 is Base Sepolia.
CHAIN_ID=31337
RPC_URL=http://127.0.0.1:8545

# Repository root, relative to web/. Contract addresses are read from
# <REPO_ROOT>/contracts/deployments/<network>.json, written by the deploy script.
REPO_ROOT=..

# Supabase project URL and its publishable (anon) key. Not a secret: the schema
# in seed/sql/001_schema.sql enables row level security with public select
# policies, and revokes ratings.client at column level from anon. Never put a
# database connection string or a service role key here.
SUPABASE_URL=
SUPABASE_ANON_KEY=

# Origin the QR code encodes. http://<your-lan-ip>:3000 to test from a phone.
APP_ORIGIN=http://localhost:3000
```

- [ ] **Step 2: Install and verify the toolchain**

Run:

```bash
cd web && npm install
```

Expected: installs cleanly, `web/package-lock.json` appears. If npm resolves `next` to a version below 15.5, stop and report it — the `params`-as-a-Promise signature in Task 11 depends on Next 15.

- [ ] **Step 3: Write the design tokens and the root layout**

`web/app/globals.css` — the token values are copied verbatim from `docs/DESIGN-SYSTEM.md`. Do not invent a shade:

```css
@import "tailwindcss";

@theme {
  --color-bg:          #FAFAF9;
  --color-surface:     #FFFFFF;
  --color-border:      #E7E5E4;
  --color-fg:          #1C1917;
  --color-fg-muted:    #78716C;

  --color-accent:      #1E40AF;
  --color-accent-weak: #EFF6FF;

  --color-verified:    #15803D;
  --color-caution:     #B45309;
  --color-danger:      #B91C1C;

  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-jetbrains-mono), ui-monospace, monospace;
}

@layer base {
  body {
    background-color: var(--color-bg);
    color: var(--color-fg);
    font-family: var(--font-sans);
    font-size: 15px;
    line-height: 24px;
  }

  /* Score numbers must not jitter as digits change width. */
  .tabular {
    font-variant-numeric: tabular-nums;
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
    }
  }
}
```

`web/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'WorkLedger',
  description: 'Portable work reputation, verifiable by anyone.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <div className="mx-auto max-w-[1120px] px-4 py-6 md:px-6 md:py-8">{children}</div>
      </body>
    </html>
  )
}
```

`next/font/google` downloads the font files during the build, so the first build needs network access. If the build cannot reach Google Fonts, drop both font imports and set `--font-sans`/`--font-mono` to plain system stacks in `globals.css`, then say so in the task report — a blocked build is not a reason to invent a different type system.

`web/app/page.tsx` — a bare root would render Next's 404 and read as a broken deployment:

```tsx
export default function HomePage() {
  return (
    <main className="py-12">
      <h1 className="text-2xl font-semibold">WorkLedger</h1>
      <p className="mt-4 max-w-prose text-[var(--color-fg-muted)]">
        A worker&apos;s rating history, checkable by anyone holding the link. Open a
        profile at <span className="font-mono text-[13px]">/w/&lt;address&gt;</span>.
      </p>
    </main>
  )
}
```

- [ ] **Step 4: Verify the build**

Run:

```bash
cd web && npm run typecheck && npm run build
```

Expected: both pass. The build output lists `/` as a static route. A Tailwind error mentioning `@theme` means `@tailwindcss/postcss` is not wired — recheck `postcss.config.mjs`.

- [ ] **Step 5: Commit**

```bash
git add web .gitignore
git commit -m "feat(web): scaffold next app with design tokens"
```

---

### Task 2: `lib/address.ts` — validate and normalise

**Files:**
- Create: `web/lib/address.ts`
- Test: `web/test/address.test.ts`

**Interfaces:**
- Consumes: `viem` (`isAddress`, `getAddress`).
- Produces: `interface NormalizedAddress { queryKey: string; display: Address }` and `normalizeAddress(raw: string): NormalizedAddress | null`. Every later task calls this before touching either data source.

- [ ] **Step 1: Write the failing test**

`web/test/address.test.ts`:

```ts
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { normalizeAddress } from '../lib/address.ts'

const LOWER = '0xc0895fa97828c38109b25c4cbb060bf7b05cbb5b'
const CHECKSUMMED = '0xC0895fa97828c38109b25C4CBb060Bf7B05CBb5B'

test('accepts a lowercase address and keeps both forms', () => {
  const result = normalizeAddress(LOWER)
  assert.notEqual(result, null)
  assert.equal(result?.queryKey, LOWER)
  assert.equal(result?.display, CHECKSUMMED)
})

test('accepts a checksummed address and lowercases the query key', () => {
  const result = normalizeAddress(CHECKSUMMED)
  assert.equal(result?.queryKey, LOWER)
  assert.equal(result?.display, CHECKSUMMED)
})

test('rejects an address whose checksum does not hold', () => {
  // Same hex, one character's case flipped: a mistyped or mangled link.
  const mangled = '0xc0895FA97828c38109b25C4CBb060Bf7B05CBb5B'
  assert.equal(normalizeAddress(mangled), null)
})

test('rejects malformed input', () => {
  for (const raw of ['', '0x', 'not-an-address', LOWER.slice(0, -1), LOWER.slice(2)]) {
    assert.equal(normalizeAddress(raw), null, `expected null for ${JSON.stringify(raw)}`)
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test`
Expected: FAIL — cannot find module `../lib/address.ts`.

- [ ] **Step 3: Write the implementation**

`web/lib/address.ts`:

```ts
import { getAddress, isAddress, type Address } from 'viem'

export interface NormalizedAddress {
  /** Lowercase form. docs/DATA-MODEL.md allows no other form as a query key. */
  queryKey: string
  /** Checksummed form, for display only. */
  display: Address
}

/**
 * Validate a route parameter and return both forms of the address.
 *
 * Returns null rather than throwing: a mistyped link is the common case, and
 * docs/DESIGN-SYSTEM.md renders an unknown address as a plain "not found"
 * rather than as an error. viem's isAddress rejects a mixed-case address whose
 * checksum does not hold, which is exactly the mangled-link case.
 */
export function normalizeAddress(raw: string): NormalizedAddress | null {
  if (!isAddress(raw)) return null

  const display = getAddress(raw)
  return { queryKey: display.toLowerCase(), display }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/lib/address.ts web/test/address.test.ts
git commit -m "feat(web): validate and normalise route addresses"
```

---

### Task 3: `lib/score.ts` — the display and state decisions

**Files:**
- Create: `web/lib/score.ts`
- Test: `web/test/score.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `UNPROVEN_THRESHOLD = 10`, `RECENT_RATING_LIMIT = 10`
  - `formatScore(scoreBps: number): string`
  - `type Distribution = readonly [number, number, number, number, number]`
  - `countByScore(scores: readonly number[]): Distribution`
  - `type ProfileState = 'not-found' | 'partial' | 'empty' | 'unproven' | 'verified'`
  - `interface ProfileSignals { addressValid: boolean; chainRead: 'ok' | 'failed'; registered: boolean; hasWorkerRow: boolean; ratingCount: number; hasDeactivatedIssuer: boolean }`
  - `interface ProfileVerdict { state: ProfileState; neutralRing: boolean }`
  - `selectState(signals: ProfileSignals): ProfileVerdict`

- [ ] **Step 1: Write the failing test**

`web/test/score.test.ts`:

```ts
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { countByScore, formatScore, selectState, type ProfileSignals } from '../lib/score.ts'

test('formats basis points by truncating, the way the contract does', () => {
  assert.equal(formatScore(43200), '4.32')
  assert.equal(formatScore(43299), '4.32') // toFixed would round this to 4.33
  assert.equal(formatScore(30000), '3.00')
  assert.equal(formatScore(50000), '5.00')
  assert.equal(formatScore(40500), '4.05')
})

test('counts a rating set into five buckets', () => {
  assert.deepEqual(countByScore([5, 5, 4, 1, 5]), [1, 0, 0, 1, 3])
  assert.deepEqual(countByScore([]), [0, 0, 0, 0, 0])
})

test('rejects a score outside the range the contract enforces', () => {
  assert.throws(() => countByScore([0]), /score out of range/)
  assert.throws(() => countByScore([6]), /score out of range/)
  assert.throws(() => countByScore([4.5]), /score out of range/)
})

const healthy: ProfileSignals = {
  addressValid: true,
  chainRead: 'ok',
  registered: true,
  hasWorkerRow: true,
  ratingCount: 40,
  hasDeactivatedIssuer: false,
}

test('an invalid address is not found, before any read', () => {
  assert.deepEqual(selectState({ ...healthy, addressValid: false }), {
    state: 'not-found',
    neutralRing: false,
  })
})

test('an unregistered address with no row is not found', () => {
  assert.deepEqual(
    selectState({ ...healthy, registered: false, hasWorkerRow: false, ratingCount: 0 }),
    { state: 'not-found', neutralRing: false },
  )
})

test('no ratings yet is empty, not unproven', () => {
  assert.deepEqual(selectState({ ...healthy, ratingCount: 0 }), {
    state: 'empty',
    neutralRing: false,
  })
})

test('under the threshold is unproven', () => {
  assert.deepEqual(selectState({ ...healthy, ratingCount: 9 }), {
    state: 'unproven',
    neutralRing: false,
  })
})

test('at the threshold is verified', () => {
  assert.deepEqual(selectState({ ...healthy, ratingCount: 10 }), {
    state: 'verified',
    neutralRing: false,
  })
})

test('a failed chain read falls back to the cached row as partial', () => {
  assert.deepEqual(selectState({ ...healthy, chainRead: 'failed' }), {
    state: 'partial',
    neutralRing: false,
  })
})

test('a failed chain read with no cached row is not found', () => {
  assert.deepEqual(selectState({ ...healthy, chainRead: 'failed', hasWorkerRow: false }), {
    state: 'not-found',
    neutralRing: false,
  })
})

test('a deactivated issuer neutralises the ring without changing the state', () => {
  assert.deepEqual(selectState({ ...healthy, hasDeactivatedIssuer: true }), {
    state: 'verified',
    neutralRing: true,
  })
  assert.deepEqual(selectState({ ...healthy, ratingCount: 3, hasDeactivatedIssuer: true }), {
    state: 'unproven',
    neutralRing: true,
  })
})

test('a failed database read still reports the chain state', () => {
  // A database outage arrives as a missing worker row. The score is the
  // chain's answer, so it must survive one.
  assert.deepEqual(selectState({ ...healthy, hasWorkerRow: false }), {
    state: 'verified',
    neutralRing: false,
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test`
Expected: FAIL — cannot find module `../lib/score.ts`.

- [ ] **Step 3: Write the implementation**

`web/lib/score.ts`:

```ts
/** docs/DESIGN-SYSTEM.md: under ten ratings the profile is unproven. */
export const UNPROVEN_THRESHOLD = 10

/** How many ratings the public page lists. The distribution still counts all of them. */
export const RECENT_RATING_LIMIT = 10

/**
 * Basis points to a two-decimal score.
 *
 * Integer arithmetic, matching bpsToDecimal in seed/src/db.ts and
 * docs/DECISIONS.md entry K: toFixed rounds, and previewScoreBps truncates
 * toward zero. Rounding here would print a score the contract never returned.
 */
export function formatScore(scoreBps: number): string {
  const hundredths = Math.trunc(scoreBps / 100)
  return (hundredths / 100).toFixed(2)
}

/** Counts for scores 1 through 5, in that order. */
export type Distribution = readonly [number, number, number, number, number]

export function countByScore(scores: readonly number[]): Distribution {
  const counts: [number, number, number, number, number] = [0, 0, 0, 0, 0]

  for (const score of scores) {
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new Error(`score out of range: ${score}`)
    }
    // The ?? 0 is noUncheckedIndexedAccess bookkeeping, not a real branch: the
    // range check above already proves the index is 0..4.
    counts[score - 1] = (counts[score - 1] ?? 0) + 1
  }

  return counts
}

export type ProfileState = 'not-found' | 'partial' | 'empty' | 'unproven' | 'verified'

export interface ProfileSignals {
  addressValid: boolean
  chainRead: 'ok' | 'failed'
  registered: boolean
  hasWorkerRow: boolean
  ratingCount: number
  hasDeactivatedIssuer: boolean
}

export interface ProfileVerdict {
  state: ProfileState
  /** ScoreBadge draws a neutral ring and a footnote instead of green or amber. */
  neutralRing: boolean
}

/**
 * Decide which of the page's states to render.
 *
 * Order matters. The spec's table reads top to bottom, and every earlier row
 * wins: an invalid address is answered without a read at all, and a failed
 * chain read cannot be reported as verified no matter what the cache says.
 */
export function selectState(signals: ProfileSignals): ProfileVerdict {
  const notFound: ProfileVerdict = { state: 'not-found', neutralRing: false }

  if (!signals.addressValid) return notFound

  if (signals.chainRead === 'failed') {
    return signals.hasWorkerRow
      ? { state: 'partial', neutralRing: signals.hasDeactivatedIssuer }
      : notFound
  }

  if (!signals.registered && !signals.hasWorkerRow) return notFound
  if (signals.ratingCount === 0) return { state: 'empty', neutralRing: false }

  return {
    state: signals.ratingCount < UNPROVEN_THRESHOLD ? 'unproven' : 'verified',
    neutralRing: signals.hasDeactivatedIssuer,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test`
Expected: all tests in `address.test.ts` and `score.test.ts` pass.

- [ ] **Step 5: Commit**

```bash
git add web/lib/score.ts web/test/score.test.ts
git commit -m "feat(web): add score formatting and state selection"
```

---

### Task 4: `lib/chain.ts` — deployment addresses and chain reads

**Files:**
- Create: `web/lib/chain.ts`
- Test: `web/test/chain.test.ts`, `web/test/chain.anvil.test.ts`

**Interfaces:**
- Consumes: `lib/address.ts` types, `contracts/deployments/anvil.json`.
- Produces:
  - `interface Deployment { chainId: number; block: number; platformRegistry: Address; ratingRegistry: Address; workerRegistry: Address }`
  - `parseDeployment(value: unknown): Deployment`
  - `deploymentPath(chainId: number, repoRoot: string): string`
  - `loadDeployment(chainId: number, repoRoot: string): Deployment`
  - `explorerAddressUrl(chainId: number, address: string): string | null`
  - `explorerTxUrl(chainId: number, txHash: string): string | null`
  - `createChainClient(chainId: number, rpcUrl: string): PublicClient`
  - `interface WorkerChainState { registered: boolean; registeredAt: number; ratingCount: number; scoreBps: number }`
  - `readWorkerChainState(client, deployment, worker): Promise<WorkerChainState>`
  - `readPlatformActivity(client, deployment, platformIds): Promise<Map<number, boolean>>`

- [ ] **Step 1: Write the failing test**

`web/test/chain.test.ts`:

```ts
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  deploymentPath,
  explorerAddressUrl,
  explorerTxUrl,
  parseDeployment,
} from '../lib/chain.ts'

test('parses the deployment file the deploy script writes', () => {
  const raw: unknown = JSON.parse(
    readFileSync(deploymentPath(31337, '..'), 'utf8'),
  )
  const deployment = parseDeployment(raw)

  assert.equal(deployment.chainId, 31337)
  assert.equal(deployment.workerRegistry.startsWith('0x'), true)
  assert.equal(deployment.ratingRegistry.length, 42)
  assert.equal(deployment.platformRegistry.length, 42)
})

test('maps chain ids to their deployment file', () => {
  assert.equal(deploymentPath(31337, '..').endsWith('contracts/deployments/anvil.json'), true)
  assert.equal(
    deploymentPath(84532, '..').endsWith('contracts/deployments/base-sepolia.json'),
    true,
  )
  assert.throws(() => deploymentPath(1, '..'), /no deployment file for chain id 1/)
})

test('rejects a deployment missing an address', () => {
  assert.throws(
    () => parseDeployment({ chainId: 31337, block: 0, workerRegistry: '0x00' }),
    /deployment/,
  )
})

test('offers explorer links only where an explorer exists', () => {
  const address = '0xC0895fa97828c38109b25C4CBb060Bf7B05CBb5B'
  const txHash = `0x${'ab'.repeat(32)}`

  assert.equal(
    explorerAddressUrl(84532, address),
    `https://sepolia.basescan.org/address/${address}`,
  )
  assert.equal(explorerTxUrl(84532, txHash), `https://sepolia.basescan.org/tx/${txHash}`)
  assert.equal(explorerAddressUrl(31337, address), null)
  assert.equal(explorerTxUrl(31337, txHash), null)
})
```

`web/test/chain.anvil.test.ts` — needs a running anvil with the contracts deployed, exactly like `seed/test/*.anvil.test.ts`:

```ts
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createChainClient, loadDeployment, readWorkerChainState } from '../lib/chain.ts'

const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545'
const UNKNOWN = '0x0000000000000000000000000000000000000001' as const

test('an unregistered address reads back as unregistered, carrying the prior score', async () => {
  const deployment = loadDeployment(31337, '..')
  const client = createChainClient(31337, RPC_URL)

  const state = await readWorkerChainState(client, deployment, UNKNOWN)

  assert.equal(state.registered, false)
  assert.equal(state.ratingCount, 0)
  // The trap this test exists for: scoreOf returns PRIOR_SCORE_BPS, not zero,
  // so the page must gate every score display on `registered`.
  assert.equal(state.scoreBps, 30000)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npm test`
Expected: FAIL — cannot find module `../lib/chain.ts`.

- [ ] **Step 3: Write the implementation**

`web/lib/chain.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createPublicClient,
  http,
  isAddress,
  parseAbi,
  type Address,
  type PublicClient,
} from 'viem'
import { anvil, baseSepolia } from 'viem/chains'

const DEPLOYMENT_FILES: Record<number, string> = {
  [anvil.id]: 'anvil.json',
  [baseSepolia.id]: 'base-sepolia.json',
}

const CHAINS = { [anvil.id]: anvil, [baseSepolia.id]: baseSepolia } as const

export const workerRegistryAbi = parseAbi([
  'function isRegistered(address worker) view returns (bool)',
  'function statsOf(address worker) view returns (uint64 registeredAt, uint32 ratingCount, uint32 scoreSum)',
])

export const ratingRegistryAbi = parseAbi([
  'function scoreOf(address worker) view returns (uint256 scoreBps)',
])

export const platformRegistryAbi = parseAbi([
  'struct Platform { address signer; uint64 registeredAt; bool active; bytes32 nameHash; }',
  'function platformAt(uint32 platformId) view returns (Platform)',
])

export interface Deployment {
  chainId: number
  block: number
  platformRegistry: Address
  ratingRegistry: Address
  workerRegistry: Address
}

function requireAddress(value: unknown, field: string): Address {
  if (typeof value !== 'string' || !isAddress(value)) {
    throw new Error(`deployment field ${field} is not an address: ${String(value)}`)
  }
  return value
}

export function parseDeployment(value: unknown): Deployment {
  if (typeof value !== 'object' || value === null) {
    throw new Error('deployment is not an object')
  }

  const record = value as Record<string, unknown>
  const chainId = record.chainId
  const block = record.block

  if (typeof chainId !== 'number') throw new Error('deployment field chainId is not a number')
  if (typeof block !== 'number') throw new Error('deployment field block is not a number')

  return {
    chainId,
    block,
    platformRegistry: requireAddress(record.platformRegistry, 'platformRegistry'),
    ratingRegistry: requireAddress(record.ratingRegistry, 'ratingRegistry'),
    workerRegistry: requireAddress(record.workerRegistry, 'workerRegistry'),
  }
}

export function deploymentPath(chainId: number, repoRoot: string): string {
  const file = DEPLOYMENT_FILES[chainId]
  if (file === undefined) throw new Error(`no deployment file for chain id ${chainId}`)
  return join(repoRoot, 'contracts', 'deployments', file)
}

export function loadDeployment(chainId: number, repoRoot: string): Deployment {
  const path = deploymentPath(chainId, repoRoot)
  const deployment = parseDeployment(JSON.parse(readFileSync(path, 'utf8')))

  if (deployment.chainId !== chainId) {
    throw new Error(
      `${path} holds chain id ${deployment.chainId}, but chain id ${chainId} was asked for`,
    )
  }

  return deployment
}

/**
 * A block explorer link, or null where there is no explorer.
 *
 * anvil has none. A dead Basescan link is worse than no link, because the
 * verifier who clicks it is exactly the person checking the raw record.
 */
export function explorerAddressUrl(chainId: number, address: string): string | null {
  return chainId === baseSepolia.id ? `https://sepolia.basescan.org/address/${address}` : null
}

export function explorerTxUrl(chainId: number, txHash: string): string | null {
  return chainId === baseSepolia.id ? `https://sepolia.basescan.org/tx/${txHash}` : null
}

export function createChainClient(chainId: number, rpcUrl: string): PublicClient {
  const chain = CHAINS[chainId as keyof typeof CHAINS]
  if (chain === undefined) throw new Error(`unsupported chain id ${chainId}`)

  return createPublicClient({ chain, transport: http(rpcUrl) })
}

export interface WorkerChainState {
  registered: boolean
  /** Unix seconds. 0 when unregistered. */
  registeredAt: number
  ratingCount: number
  /** Basis points. Carries the prior baseline even when unregistered. */
  scoreBps: number
}

export async function readWorkerChainState(
  client: PublicClient,
  deployment: Deployment,
  worker: Address,
): Promise<WorkerChainState> {
  const [registered, stats, scoreBps] = await Promise.all([
    client.readContract({
      address: deployment.workerRegistry,
      abi: workerRegistryAbi,
      functionName: 'isRegistered',
      args: [worker],
    }),
    client.readContract({
      address: deployment.workerRegistry,
      abi: workerRegistryAbi,
      functionName: 'statsOf',
      args: [worker],
    }),
    client.readContract({
      address: deployment.ratingRegistry,
      abi: ratingRegistryAbi,
      functionName: 'scoreOf',
      args: [worker],
    }),
  ])

  const [registeredAt, ratingCount] = stats

  return {
    registered,
    registeredAt: Number(registeredAt),
    ratingCount: Number(ratingCount),
    scoreBps: Number(scoreBps),
  }
}

/**
 * Active flag per platform id.
 *
 * Reads the chain rather than Postgres because the platforms table has no
 * active column: whether a platform may still issue attestations is the
 * chain's answer. The struct's nameHash is deliberately ignored — the display
 * name lives in Postgres, and a bytes32 is not a name.
 */
export async function readPlatformActivity(
  client: PublicClient,
  deployment: Deployment,
  platformIds: readonly number[],
): Promise<Map<number, boolean>> {
  const unique = [...new Set(platformIds)]

  const records = await Promise.all(
    unique.map((id) =>
      client.readContract({
        address: deployment.platformRegistry,
        abi: platformRegistryAbi,
        functionName: 'platformAt',
        args: [id],
      }),
    ),
  )

  return new Map(unique.map((id, index) => [id, records[index]?.active ?? false]))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run the offline tests: `cd web && npm test`
Expected: `chain.test.ts` passes with the others.

Then the chain test, which needs anvil in another terminal:

```bash
# terminal 1
anvil

# terminal 2
cd contracts && forge script script/Deploy.s.sol:DeployScript \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast

cd ../web && npm run test:chain
```

Expected: PASS, with `scoreBps` equal to 30000. If it reads 0, the deployment being read is not the one anvil is running — check that `contracts/deployments/anvil.json` was rewritten by this deploy.

- [ ] **Step 5: Commit**

```bash
git add web/lib/chain.ts web/test/chain.test.ts web/test/chain.anvil.test.ts
git commit -m "feat(web): read worker stats and platform status from chain"
```

---

### Task 5: `lib/db.ts` — the profile query and its row mapping

**Files:**
- Create: `web/lib/db.ts`
- Test: `web/test/db.test.ts`

**Interfaces:**
- Consumes: `lib/score.ts` (`countByScore`, `RECENT_RATING_LIMIT`, `Distribution`), `lib/chain.ts` (`WorkerChainState`).
- Produces:
  - `interface WorkerRow`, `interface RatingRow`
  - `interface RatingView { jobId: string; score: number; comment: string | null; jobTitle: string | null; platformId: number; platformName: string | null; platformActive: boolean; submittedAt: string; txHash: string }`
  - `interface PlatformView { id: number; name: string | null; active: boolean }`
  - `interface ProfileView { displayName: string | null; headline: string | null; distribution: Distribution; ratings: RatingView[]; platforms: PlatformView[]; cachedScore: string | null; cachedCount: number | null; cachedAt: string | null; hasDeactivatedIssuer: boolean }`
  - `toProfileView(workerRow: WorkerRow | null, ratingRows: readonly RatingRow[], platformActivity: Map<number, boolean>): ProfileView`
  - `createDatabaseClient(url: string, anonKey: string): SupabaseClient`
  - `fetchWorkerRow(client, queryKey): Promise<WorkerRow | null>`
  - `fetchRatingRows(client, queryKey): Promise<RatingRow[]>`

- [ ] **Step 1: Write the failing test**

`web/test/db.test.ts`:

```ts
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { toProfileView, type RatingRow, type WorkerRow } from '../lib/db.ts'

const worker: WorkerRow = {
  display_name: 'Rani Wibowo',
  headline: 'Courier, three cities',
  cached_score: '4.32',
  cached_count: 12,
  cached_at: '2026-09-11T02:00:00.000Z',
}

function rating(index: number, score: number, platformId: number): RatingRow {
  return {
    job_id: `0x${index.toString(16).padStart(64, '0')}`,
    score,
    comment: `comment ${index}`,
    job_title: 'Same-day delivery',
    submitted_at: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    tx_hash: `0x${'cd'.repeat(32)}`,
    platform_id: platformId,
    platforms: { name: `Platform ${platformId}` },
  }
}

// Twelve rows, so the ten-row list cannot be mistaken for the whole history.
const ratings: RatingRow[] = [
  ...Array.from({ length: 9 }, (_, index) => rating(index, 5, 1)),
  rating(9, 4, 2),
  rating(10, 1, 2),
  rating(11, 3, 3),
]

test('counts the distribution over every rating, not just the listed ones', () => {
  const view = toProfileView(worker, ratings, new Map([[1, true], [2, true], [3, true]]))

  assert.deepEqual(view.distribution, [1, 0, 1, 1, 9])
  assert.equal(view.distribution.reduce((sum, count) => sum + count, 0), 12)
  assert.equal(view.ratings.length, 10)
})

test('keeps the order it was given, newest first', () => {
  const newestFirst = [...ratings].reverse()
  const view = toProfileView(worker, newestFirst, new Map([[1, true], [2, true], [3, true]]))

  assert.equal(view.ratings[0]?.jobId, newestFirst[0]?.job_id)
})

test('collects the platforms in the history with their chain status', () => {
  const view = toProfileView(worker, ratings, new Map([[1, true], [2, false], [3, true]]))

  assert.deepEqual(
    view.platforms.map((platform) => [platform.id, platform.name, platform.active]),
    [
      [1, 'Platform 1', true],
      [2, 'Platform 2', false],
      [3, 'Platform 3', true],
    ],
  )
  assert.equal(view.hasDeactivatedIssuer, true)
})

test('reports no deactivated issuer when every platform is active', () => {
  const view = toProfileView(worker, ratings, new Map([[1, true], [2, true], [3, true]]))
  assert.equal(view.hasDeactivatedIssuer, false)
})

test('treats a platform absent from the chain map as inactive', () => {
  const view = toProfileView(worker, [rating(0, 5, 7)], new Map())

  assert.equal(view.platforms[0]?.active, false)
  assert.equal(view.hasDeactivatedIssuer, true)
})

test('survives a missing worker row', () => {
  const view = toProfileView(null, ratings, new Map([[1, true], [2, true], [3, true]]))

  assert.equal(view.displayName, null)
  assert.equal(view.headline, null)
  assert.equal(view.cachedAt, null)
  assert.equal(view.ratings.length, 10)
})

test('accepts the embedded platform arriving as an array', () => {
  // supabase-js types a foreign-table embed as an array in some versions; the
  // mapper accepts both shapes rather than betting on one.
  const row: RatingRow = { ...rating(0, 5, 1), platforms: [{ name: 'Platform 1' }] }
  const view = toProfileView(worker, [row], new Map([[1, true]]))

  assert.equal(view.ratings[0]?.platformName, 'Platform 1')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test`
Expected: FAIL — cannot find module `../lib/db.ts`.

- [ ] **Step 3: Write the implementation**

`web/lib/db.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { countByScore, RECENT_RATING_LIMIT, type Distribution } from './score.ts'

/** The columns of `workers` this page reads. */
export interface WorkerRow {
  display_name: string | null
  headline: string | null
  cached_score: string | number | null
  cached_count: number | null
  cached_at: string | null
}

type EmbeddedPlatform = { name: string } | { name: string }[] | null

/**
 * The columns of `ratings` this page reads.
 *
 * `client` is absent on purpose and cannot be added: seed/sql/001_schema.sql
 * revokes select on that column from anon.
 */
export interface RatingRow {
  job_id: string
  score: number
  comment: string | null
  job_title: string | null
  submitted_at: string
  tx_hash: string
  platform_id: number
  platforms: EmbeddedPlatform
}

export interface RatingView {
  jobId: string
  score: number
  comment: string | null
  jobTitle: string | null
  platformId: number
  platformName: string | null
  platformActive: boolean
  submittedAt: string
  txHash: string
}

export interface PlatformView {
  id: number
  name: string | null
  active: boolean
}

export interface ProfileView {
  displayName: string | null
  headline: string | null
  distribution: Distribution
  /** Newest first, capped at RECENT_RATING_LIMIT. */
  ratings: RatingView[]
  platforms: PlatformView[]
  cachedScore: string | null
  cachedCount: number | null
  cachedAt: string | null
  hasDeactivatedIssuer: boolean
}

function platformName(embedded: EmbeddedPlatform): string | null {
  if (embedded === null) return null
  if (Array.isArray(embedded)) return embedded[0]?.name ?? null
  return embedded.name
}

/**
 * Stitch a worker row, its ratings, and the chain's platform status into the
 * shape the components consume.
 *
 * The distribution counts every row, while the list is capped: an average
 * hides shape, and a ten-row sample of a forty-rating history would hide it
 * again.
 */
export function toProfileView(
  workerRow: WorkerRow | null,
  ratingRows: readonly RatingRow[],
  platformActivity: Map<number, boolean>,
): ProfileView {
  const ratings: RatingView[] = ratingRows.slice(0, RECENT_RATING_LIMIT).map((row) => ({
    jobId: row.job_id,
    score: row.score,
    comment: row.comment,
    jobTitle: row.job_title,
    platformId: row.platform_id,
    platformName: platformName(row.platforms),
    platformActive: platformActivity.get(row.platform_id) ?? false,
    submittedAt: row.submitted_at,
    txHash: row.tx_hash,
  }))

  const platforms: PlatformView[] = []
  for (const row of ratingRows) {
    if (platforms.some((platform) => platform.id === row.platform_id)) continue
    platforms.push({
      id: row.platform_id,
      name: platformName(row.platforms),
      // An id the chain did not return is treated as inactive. Claiming an
      // unknown issuer is active would be the wrong way to be wrong.
      active: platformActivity.get(row.platform_id) ?? false,
    })
  }
  platforms.sort((left, right) => left.id - right.id)

  const cachedScore = workerRow?.cached_score
  return {
    displayName: workerRow?.display_name ?? null,
    headline: workerRow?.headline ?? null,
    distribution: countByScore(ratingRows.map((row) => row.score)),
    ratings,
    platforms,
    cachedScore: cachedScore === null || cachedScore === undefined ? null : String(cachedScore),
    cachedCount: workerRow?.cached_count ?? null,
    cachedAt: workerRow?.cached_at ?? null,
    hasDeactivatedIssuer: platforms.some((platform) => !platform.active),
  }
}

/**
 * A read-only client on the publishable key.
 *
 * Row level security plus the column grants in seed/sql/001_schema.sql are the
 * whole authorisation model here. No connection string and no service role key
 * belongs in this application.
 */
export function createDatabaseClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, { auth: { persistSession: false } })
}

export async function fetchWorkerRow(
  client: SupabaseClient,
  queryKey: string,
): Promise<WorkerRow | null> {
  const { data, error } = await client
    .from('workers')
    .select('display_name, headline, cached_score, cached_count, cached_at')
    .eq('address', queryKey)
    .maybeSingle()

  if (error !== null) throw new Error(`workers read failed: ${error.message}`)
  return data as WorkerRow | null
}

export async function fetchRatingRows(
  client: SupabaseClient,
  queryKey: string,
): Promise<RatingRow[]> {
  const { data, error } = await client
    .from('ratings')
    .select('job_id, score, comment, job_title, submitted_at, tx_hash, platform_id, platforms(name)')
    .eq('worker', queryKey)
    .order('submitted_at', { ascending: false })

  if (error !== null) throw new Error(`ratings read failed: ${error.message}`)
  return (data ?? []) as RatingRow[]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test`
Expected: 7 db tests pass alongside the earlier suites. Then `npm run typecheck` to confirm the two `as` casts on Supabase's return types are the only ones needed.

- [ ] **Step 5: Commit**

```bash
git add web/lib/db.ts web/test/db.test.ts
git commit -m "feat(web): map profile rows from postgres and chain status"
```

---

### Task 6: `ScoreBadge` and `VerificationResult`

**Files:**
- Create: `web/components/ScoreBadge.tsx`, `web/components/VerificationResult.tsx`
- Test: `web/test/components.score.test.ts`

**Interfaces:**
- Consumes: `lib/score.ts` (`formatScore`, `ProfileState`).
- Produces:
  - `ScoreBadge({ scoreBps, ratingCount, state, neutralRing }: { scoreBps: number; ratingCount: number; state: ProfileState; neutralRing: boolean })`
  - `VerificationResult({ state, neutralRing, scoreBps, ratingCount, displayName, headline, cachedAt }: { state: ProfileState; neutralRing: boolean; scoreBps: number; ratingCount: number; displayName: string | null; headline: string | null; cachedAt: string | null })`

The badge cannot be handed a score without a count: both props are required and non-optional, which is the type system carrying `docs/DESIGN-SYSTEM.md`'s rule that a bare number is never rendered.

- [ ] **Step 1: Write the failing test**

`web/test/components.score.test.ts`:

```ts
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ScoreBadge } from '../components/ScoreBadge.tsx'
import { VerificationResult } from '../components/VerificationResult.tsx'

test('a verified badge shows the score, the count, and the label', () => {
  const html = renderToStaticMarkup(
    ScoreBadge({ scoreBps: 43200, ratingCount: 40, state: 'verified', neutralRing: false }),
  )

  assert.match(html, /4\.32/)
  assert.match(html, /40 ratings/)
  assert.match(html, /Verified/)
  assert.match(html, /tabular/)
})

test('an unproven badge says so and explains the sample', () => {
  const html = renderToStaticMarkup(
    ScoreBadge({ scoreBps: 46000, ratingCount: 2, state: 'unproven', neutralRing: false }),
  )

  assert.match(html, /Unproven/)
  assert.match(html, /2 ratings/)
})

test('a single rating is not pluralised', () => {
  const html = renderToStaticMarkup(
    ScoreBadge({ scoreBps: 50000, ratingCount: 1, state: 'unproven', neutralRing: false }),
  )

  assert.match(html, /1 rating[^s]/)
})

test('a deactivated issuer replaces the label with a footnote', () => {
  const html = renderToStaticMarkup(
    ScoreBadge({ scoreBps: 43200, ratingCount: 40, state: 'verified', neutralRing: true }),
  )

  assert.match(html, /no longer issues ratings/)
})

test('the not-found hero shows no score at all', () => {
  const html = renderToStaticMarkup(
    VerificationResult({
      state: 'not-found',
      neutralRing: false,
      scoreBps: 30000,
      ratingCount: 0,
      displayName: null,
      headline: null,
      cachedAt: null,
    }),
  )

  // The prior baseline must never surface as a score for an unknown address.
  assert.equal(html.includes('3.00'), false)
  assert.match(html, /No record/)
})

test('the empty hero explains where ratings come from', () => {
  const html = renderToStaticMarkup(
    VerificationResult({
      state: 'empty',
      neutralRing: false,
      scoreBps: 30000,
      ratingCount: 0,
      displayName: 'Rani Wibowo',
      headline: null,
      cachedAt: null,
    }),
  )

  assert.equal(html.includes('3.00'), false)
  assert.match(html, /No ratings yet/)
})

test('the partial hero marks the value as cached', () => {
  const html = renderToStaticMarkup(
    VerificationResult({
      state: 'partial',
      neutralRing: false,
      scoreBps: 43200,
      ratingCount: 12,
      displayName: 'Rani Wibowo',
      headline: 'Courier',
      cachedAt: '2026-09-11T02:00:00.000Z',
    }),
  )

  assert.match(html, /Showing the last known value/)
})

test('a verified hero carries the last updated timestamp', () => {
  const html = renderToStaticMarkup(
    VerificationResult({
      state: 'verified',
      neutralRing: false,
      scoreBps: 43200,
      ratingCount: 40,
      displayName: 'Rani Wibowo',
      headline: null,
      cachedAt: '2026-09-11T02:00:00.000Z',
    }),
  )

  assert.match(html, /Last updated/)
  assert.equal(html.includes('Showing the last known value'), false)
})

test('every state carries a text label beside its colour', () => {
  for (const state of ['verified', 'unproven', 'empty', 'not-found', 'partial'] as const) {
    const html = renderToStaticMarkup(
      VerificationResult({
        state,
        neutralRing: false,
        scoreBps: 43200,
        ratingCount: 12,
        displayName: 'Rani Wibowo',
        headline: null,
        cachedAt: null,
      }),
    )
    assert.match(html, /aria-label=/, `${state} needs an aria-label on its icon`)
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test`
Expected: FAIL — cannot find module `../components/ScoreBadge.tsx`.

- [ ] **Step 3: Write the implementation**

`web/components/ScoreBadge.tsx`:

```tsx
import { formatScore, type ProfileState } from '../lib/score.ts'

interface ScoreBadgeProps {
  scoreBps: number
  ratingCount: number
  state: ProfileState
  neutralRing: boolean
}

const RING: Record<'verified' | 'unproven' | 'neutral', string> = {
  verified: 'border-[var(--color-verified)]',
  unproven: 'border-[var(--color-caution)]',
  neutral: 'border-[var(--color-border)]',
}

/**
 * The centerpiece. Never renders a number without its count: a 5.00 from one
 * job and a 4.70 from three hundred must not look alike.
 */
export function ScoreBadge({ scoreBps, ratingCount, state, neutralRing }: ScoreBadgeProps) {
  const tone = neutralRing ? 'neutral' : state === 'verified' ? 'verified' : 'unproven'
  const label = state === 'verified' ? 'Verified' : 'Unproven'
  const icon = state === 'verified' ? '✓' : '!'

  return (
    <div className={`flex items-center gap-4 rounded-lg border-2 bg-surface p-4 md:p-6 ${RING[tone]}`}>
      <p className="tabular text-[32px] font-semibold leading-10">{formatScore(scoreBps)}</p>
      <div>
        <p className="text-[13px] leading-5 text-[var(--color-fg-muted)]">
          {ratingCount} {ratingCount === 1 ? 'rating' : 'ratings'}
        </p>
        <p className="flex items-center gap-1 text-[13px] font-semibold leading-5">
          <span aria-label={label} role="img">
            {icon}
          </span>
          {label}
        </p>
        {neutralRing ? (
          <p className="mt-1 text-[13px] leading-5 text-[var(--color-fg-muted)]">
            One platform in this history no longer issues ratings.
          </p>
        ) : null}
        {state === 'unproven' && !neutralRing ? (
          <p className="mt-1 text-[13px] leading-5 text-[var(--color-fg-muted)]">
            Fewer than 10 ratings. Too small a sample to judge.
          </p>
        ) : null}
      </div>
    </div>
  )
}
```

`web/components/VerificationResult.tsx`:

```tsx
import type { ProfileState } from '../lib/score.ts'
import { ScoreBadge } from './ScoreBadge.tsx'

function formatCachedAt(iso: string): string {
  // Fixed locale and UTC, so the verifier and the person who sent the link read
  // the same timestamp.
  return new Date(iso).toLocaleString('en-GB', { timeZone: 'UTC', timeZoneName: 'short' })
}

interface VerificationResultProps {
  state: ProfileState
  neutralRing: boolean
  scoreBps: number
  ratingCount: number
  displayName: string | null
  headline: string | null
  cachedAt: string | null
}

/**
 * The page hero.
 *
 * "Not found" is deliberately plain: an unknown address is not a fraud signal,
 * and an alarming treatment would accuse the verifier of nothing they did.
 */
export function VerificationResult({
  state,
  neutralRing,
  scoreBps,
  ratingCount,
  displayName,
  headline,
  cachedAt,
}: VerificationResultProps) {
  if (state === 'not-found') {
    return (
      <section className="rounded-lg border border-[var(--color-border)] bg-surface p-4 md:p-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold leading-8">
          <span aria-label="No record" role="img">
            —
          </span>
          No record for this address
        </h1>
        <p className="mt-4 max-w-prose text-[var(--color-fg-muted)]">
          Nothing has been recorded here. That is not a warning: an address with no
          history looks exactly like an address that was mistyped.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-surface p-4 md:p-6">
      <h1 className="text-2xl font-semibold leading-8">{displayName ?? 'Unnamed worker'}</h1>
      {headline === null ? null : (
        <p className="mt-1 text-[var(--color-fg-muted)]">{headline}</p>
      )}

      <div className="mt-6">
        {state === 'empty' ? (
          <p className="flex items-center gap-2 text-[15px]">
            <span aria-label="No ratings yet" role="img">
              —
            </span>
            No ratings yet. Ratings appear here once a platform confirms a finished
            job and the client rates it.
          </p>
        ) : (
          <ScoreBadge
            scoreBps={scoreBps}
            ratingCount={ratingCount}
            state={state}
            neutralRing={neutralRing}
          />
        )}
      </div>

      {state === 'partial' ? (
        <p className="mt-4 flex items-center gap-2 text-[13px] leading-5 text-[var(--color-caution)]">
          <span aria-label="Cached value" role="img">
            ↺
          </span>
          Showing the last known value{cachedAt === null ? '' : `, saved ${formatCachedAt(cachedAt)}`}.
        </p>
      ) : cachedAt === null ? null : (
        <p className="mt-4 text-[13px] leading-5 text-[var(--color-fg-muted)]">
          Last updated {formatCachedAt(cachedAt)}.
        </p>
      )}
    </section>
  )
}
```

`bg-surface` resolves through the `@theme` token from Task 1. If Tailwind reports the class as unknown, use `bg-[var(--color-surface)]` and keep the rest unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test`
Expected: 8 component tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/components/ScoreBadge.tsx web/components/VerificationResult.tsx web/test/components.score.test.ts
git commit -m "feat(web): add score badge and verification hero"
```

---

### Task 7: `RatingDistribution`

**Files:**
- Create: `web/components/RatingDistribution.tsx`
- Test: `web/test/components.distribution.test.ts`

**Interfaces:**
- Consumes: `lib/score.ts` (`Distribution`).
- Produces: `RatingDistribution({ distribution }: { distribution: Distribution })`

- [ ] **Step 1: Write the failing test**

`web/test/components.distribution.test.ts`:

```ts
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { RatingDistribution } from '../components/RatingDistribution.tsx'

test('lists five rows, highest score first', () => {
  const html = renderToStaticMarkup(RatingDistribution({ distribution: [1, 0, 1, 1, 9] }))
  const rows = html.match(/data-score="\d"/g)

  assert.deepEqual(rows, [
    'data-score="5"',
    'data-score="4"',
    'data-score="3"',
    'data-score="2"',
    'data-score="1"',
  ])
})

test('carries the count as text, not only as bar width', () => {
  const html = renderToStaticMarkup(RatingDistribution({ distribution: [1, 0, 1, 1, 9] }))

  assert.match(html, /data-score="5"[\s\S]*?>9</)
  assert.match(html, /data-score="2"[\s\S]*?>0</)
})

test('scales bars against the largest bucket, not the total', () => {
  const html = renderToStaticMarkup(RatingDistribution({ distribution: [0, 0, 0, 2, 4] }))

  assert.match(html, /width:\s*100%/)
  assert.match(html, /width:\s*50%/)
})

test('renders an explanation instead of five empty bars', () => {
  const html = renderToStaticMarkup(RatingDistribution({ distribution: [0, 0, 0, 0, 0] }))

  assert.match(html, /No ratings to show/)
  assert.equal(html.includes('data-score='), false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test`
Expected: FAIL — cannot find module `../components/RatingDistribution.tsx`.

- [ ] **Step 3: Write the implementation**

`web/components/RatingDistribution.tsx`:

```tsx
import type { Distribution } from '../lib/score.ts'

/**
 * Horizontal bars for 1 through 5.
 *
 * An average hides shape: forty 5s with ten 1s and fifty 4s average alike, and
 * the difference is what a client needs to see. Bars scale against the largest
 * bucket so the shape stays readable when one score dominates.
 */
export function RatingDistribution({ distribution }: { distribution: Distribution }) {
  const total = distribution.reduce((sum, count) => sum + count, 0)

  if (total === 0) {
    return (
      <section className="rounded-lg border border-[var(--color-border)] bg-surface p-4 md:p-6">
        <h2 className="text-lg font-semibold leading-7">Rating spread</h2>
        <p className="mt-4 text-[var(--color-fg-muted)]">
          No ratings to show yet. Each finished job adds one row here.
        </p>
      </section>
    )
  }

  const largest = Math.max(...distribution)

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-surface p-4 md:p-6">
      <h2 className="text-lg font-semibold leading-7">Rating spread</h2>
      <ul className="mt-4 flex flex-col gap-2">
        {[5, 4, 3, 2, 1].map((score) => {
          const count = distribution[score - 1] ?? 0
          const width = largest === 0 ? 0 : Math.round((count / largest) * 100)

          return (
            <li key={score} data-score={score} className="flex items-center gap-3">
              <span className="tabular w-4 text-[13px] leading-5 text-[var(--color-fg-muted)]">
                {score}
              </span>
              <span className="h-3 flex-1 rounded-sm bg-[var(--color-accent-weak)]">
                <span
                  className="block h-3 rounded-sm bg-[var(--color-accent)]"
                  style={{ width: `${width}%` }}
                />
              </span>
              <span className="tabular w-8 text-right text-[13px] leading-5">{count}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test`
Expected: 4 distribution tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/components/RatingDistribution.tsx web/test/components.distribution.test.ts
git commit -m "feat(web): add rating distribution bars"
```

---

### Task 8: `PlatformChip` and `AddressDisplay`

**Files:**
- Create: `web/components/PlatformChip.tsx`, `web/components/AddressDisplay.tsx`
- Test: `web/test/components.chips.test.ts`

**Interfaces:**
- Consumes: `lib/db.ts` (`PlatformView`).
- Produces:
  - `PlatformChip({ platform }: { platform: PlatformView })`
  - `AddressDisplay({ address, explorerUrl }: { address: string; explorerUrl: string | null })`

- [ ] **Step 1: Write the failing test**

`web/test/components.chips.test.ts`:

```ts
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AddressDisplay } from '../components/AddressDisplay.tsx'
import { PlatformChip } from '../components/PlatformChip.tsx'

test('an active platform shows its name', () => {
  const html = renderToStaticMarkup(
    PlatformChip({ platform: { id: 1, name: 'SwiftDeliver', active: true } }),
  )

  assert.match(html, /SwiftDeliver/)
  assert.equal(html.includes('No longer issuing'), false)
})

test('an inactive platform says so in words, not only in colour', () => {
  const html = renderToStaticMarkup(
    PlatformChip({ platform: { id: 2, name: 'GigHub', active: false } }),
  )

  assert.match(html, /GigHub/)
  assert.match(html, /No longer issuing/)
})

test('a platform with no cached name falls back to its id', () => {
  const html = renderToStaticMarkup(
    PlatformChip({ platform: { id: 7, name: null, active: true } }),
  )

  assert.match(html, /Platform 7/)
})

test('the address is truncated in the middle and kept in full for copying', () => {
  const address = '0xC0895fa97828c38109b25C4CBb060Bf7B05CBb5B'
  const html = renderToStaticMarkup(AddressDisplay({ address, explorerUrl: null }))

  assert.match(html, /0xC0895f/)
  assert.match(html, /CBb5B/)
  assert.match(html, new RegExp(`data-address="${address}"`))
  assert.equal(html.includes('href='), false)
})

test('an explorer link appears only when there is an explorer', () => {
  const address = '0xC0895fa97828c38109b25C4CBb060Bf7B05CBb5B'
  const html = renderToStaticMarkup(
    AddressDisplay({ address, explorerUrl: `https://sepolia.basescan.org/address/${address}` }),
  )

  assert.match(html, /href="https:\/\/sepolia\.basescan\.org\/address\//)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test`
Expected: FAIL — cannot find module `../components/AddressDisplay.tsx`.

- [ ] **Step 3: Write the implementation**

`web/components/PlatformChip.tsx`:

```tsx
import type { PlatformView } from '../lib/db.ts'

/**
 * Platform name and issuing status.
 *
 * No logo: seed/src/db.ts writes platforms as id and name only, so logo_url is
 * null for every row. The chip takes one the moment the column has one.
 */
export function PlatformChip({ platform }: { platform: PlatformView }) {
  const name = platform.name ?? `Platform ${platform.id}`

  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-surface px-3 py-2 text-[13px] leading-5">
      <span className="font-semibold">{name}</span>
      {platform.active ? null : (
        <span className="flex items-center gap-1 text-[var(--color-danger)]">
          <span aria-label="Deactivated" role="img">
            ×
          </span>
          No longer issuing
        </span>
      )}
    </span>
  )
}
```

`web/components/AddressDisplay.tsx`:

```tsx
'use client'

import { useState } from 'react'

/**
 * Truncated middle, monospace, click to copy, and an explorer link where one
 * exists. The only client component on this page: the clipboard has no server
 * equivalent.
 */
export function AddressDisplay({
  address,
  explorerUrl,
}: {
  address: string
  explorerUrl: string | null
}) {
  const [copied, setCopied] = useState(false)
  const short = `${address.slice(0, 8)}…${address.slice(-5)}`

  async function copy() {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <span className="inline-flex items-center gap-3">
      <button
        type="button"
        onClick={copy}
        data-address={address}
        aria-label={`Copy address ${address}`}
        className="min-h-11 rounded-md border border-[var(--color-border)] bg-surface px-3 font-mono text-[13px] leading-5 transition-colors duration-150 hover:bg-[var(--color-accent-weak)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        {short}
      </button>
      <span aria-live="polite" className="text-[13px] leading-5 text-[var(--color-fg-muted)]">
        {copied ? 'Copied' : ''}
      </span>
      {explorerUrl === null ? null : (
        <a
          href={explorerUrl}
          className="min-h-11 text-[13px] leading-5 text-[var(--color-accent)] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          View the record
        </a>
      )}
    </span>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test`
Expected: 5 chip tests pass. `renderToStaticMarkup` renders a client component's initial markup without running its effects, which is all these tests assert.

- [ ] **Step 5: Commit**

```bash
git add web/components/PlatformChip.tsx web/components/AddressDisplay.tsx web/test/components.chips.test.ts
git commit -m "feat(web): add platform chip and address display"
```

---

### Task 9: `RatingList`

**Files:**
- Create: `web/components/RatingList.tsx`
- Test: `web/test/components.list.test.ts`

**Interfaces:**
- Consumes: `lib/db.ts` (`RatingView`).
- Produces: `RatingList({ ratings, totalCount, explorerTxUrl }: { ratings: readonly RatingView[]; totalCount: number; explorerTxUrl: (txHash: string) => string | null })`

- [ ] **Step 1: Write the failing test**

`web/test/components.list.test.ts`:

```ts
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { RatingList } from '../components/RatingList.tsx'
import type { RatingView } from '../lib/db.ts'

const rating: RatingView = {
  jobId: `0x${'11'.repeat(32)}`,
  score: 5,
  comment: 'Arrived early and repacked a torn box.',
  jobTitle: 'Same-day delivery',
  platformId: 1,
  platformName: 'SwiftDeliver',
  platformActive: true,
  submittedAt: '2026-09-04T09:30:00.000Z',
  txHash: `0x${'ab'.repeat(32)}`,
}

test('shows the job, the platform, the score, and the comment', () => {
  const html = renderToStaticMarkup(
    RatingList({ ratings: [rating], totalCount: 1, explorerTxUrl: () => null }),
  )

  assert.match(html, /Same-day delivery/)
  assert.match(html, /SwiftDeliver/)
  assert.match(html, /Arrived early/)
  assert.match(html, />5</)
})

test('never renders a client address', () => {
  const html = renderToStaticMarkup(
    RatingList({ ratings: [rating], totalCount: 1, explorerTxUrl: () => null }),
  )

  assert.equal(/0x[0-9a-fA-F]{40}/.test(html), false)
})

test('says how many ratings the list is showing out of the whole history', () => {
  const html = renderToStaticMarkup(
    RatingList({ ratings: [rating], totalCount: 40, explorerTxUrl: () => null }),
  )

  assert.match(html, /10 most recent|1 of 40/)
})

test('renders the transaction hash as text when there is no explorer', () => {
  const html = renderToStaticMarkup(
    RatingList({ ratings: [rating], totalCount: 1, explorerTxUrl: () => null }),
  )

  assert.match(html, /ababab/)
  assert.equal(html.includes('href='), false)
})

test('links the transaction when an explorer exists', () => {
  const html = renderToStaticMarkup(
    RatingList({
      ratings: [rating],
      totalCount: 1,
      explorerTxUrl: (txHash) => `https://sepolia.basescan.org/tx/${txHash}`,
    }),
  )

  assert.match(html, /href="https:\/\/sepolia\.basescan\.org\/tx\/0xabab/)
})

test('explains itself when there is nothing to list', () => {
  const html = renderToStaticMarkup(
    RatingList({ ratings: [], totalCount: 0, explorerTxUrl: () => null }),
  )

  assert.match(html, /No ratings yet/)
})

test('handles a rating with no comment and no job title', () => {
  const bare: RatingView = { ...rating, comment: null, jobTitle: null }
  const html = renderToStaticMarkup(
    RatingList({ ratings: [bare], totalCount: 1, explorerTxUrl: () => null }),
  )

  assert.match(html, /Untitled job/)
  assert.equal(html.includes('null'), false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test`
Expected: FAIL — cannot find module `../components/RatingList.tsx`.

- [ ] **Step 3: Write the implementation**

`web/components/RatingList.tsx`:

```tsx
import type { RatingView } from '../lib/db.ts'
import { PlatformChip } from './PlatformChip.tsx'

interface RatingListProps {
  ratings: readonly RatingView[]
  totalCount: number
  explorerTxUrl: (txHash: string) => string | null
}

function formatDate(iso: string): string {
  // Fixed locale and UTC: a verifier and the person who sent them the link
  // must read the same date, whatever their browser is set to.
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function RatingList({ ratings, totalCount, explorerTxUrl }: RatingListProps) {
  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-surface p-4 md:p-6">
      <h2 className="text-lg font-semibold leading-7">Recent ratings</h2>

      {ratings.length === 0 ? (
        <p className="mt-4 text-[var(--color-fg-muted)]">
          No ratings yet. Each one arrives after a platform confirms a finished job.
        </p>
      ) : (
        <>
          <p className="mt-1 text-[13px] leading-5 text-[var(--color-fg-muted)]">
            The {ratings.length} most recent of {totalCount}.
          </p>
          <ul className="mt-4 flex flex-col gap-4">
            {ratings.map((rating) => {
              const url = explorerTxUrl(rating.txHash)

              return (
                <li
                  key={rating.jobId}
                  className="border-t border-[var(--color-border)] pt-4 first:border-t-0 first:pt-0"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="tabular text-lg font-semibold leading-7">{rating.score}</span>
                    <span className="font-semibold">{rating.jobTitle ?? 'Untitled job'}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <PlatformChip
                      platform={{
                        id: rating.platformId,
                        name: rating.platformName,
                        active: rating.platformActive,
                      }}
                    />
                    <span className="text-[13px] leading-5 text-[var(--color-fg-muted)]">
                      {formatDate(rating.submittedAt)}
                    </span>
                  </div>
                  {rating.comment === null ? null : (
                    <p className="mt-2 max-w-prose">{rating.comment}</p>
                  )}
                  <p className="mt-2 font-mono text-[13px] leading-5 text-[var(--color-fg-muted)]">
                    {url === null ? (
                      `${rating.txHash.slice(0, 18)}…`
                    ) : (
                      <a
                        href={url}
                        className="text-[var(--color-accent)] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                      >
                        {`${rating.txHash.slice(0, 18)}…`}
                      </a>
                    )}
                  </p>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test`
Expected: 7 list tests pass. The "never renders a client address" test also guards against a future change adding one.

- [ ] **Step 5: Commit**

```bash
git add web/components/RatingList.tsx web/test/components.list.test.ts
git commit -m "feat(web): list recent ratings without client addresses"
```

---

### Task 10: `ProfileQr` and the `qrcode` dependency

**Files:**
- Create: `web/components/ProfileQr.tsx`
- Modify: `web/package.json` (add `qrcode` and `@types/qrcode`)
- Test: `web/test/components.qr.test.ts`

**Interfaces:**
- Consumes: `qrcode`.
- Produces: `profileQrSvg(url: string): Promise<string>` and `ProfileQr({ url }: { url: string })`, an async server component.

- [ ] **Step 1: Add the dependency**

Run:

```bash
cd web && npm install qrcode@^1.5.4 && npm install --save-dev @types/qrcode@^1.5.5
```

This is the one dependency this milestone adds beyond the scaffold, approved by the project owner for exactly this purpose.

- [ ] **Step 2: Write the failing test**

`web/test/components.qr.test.ts`:

```ts
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { profileQrSvg } from '../components/ProfileQr.tsx'

test('renders an svg carrying the profile url', async () => {
  const svg = await profileQrSvg('http://localhost:3000/w/0xC0895fa9')

  assert.match(svg, /^<svg/)
  assert.match(svg, /<\/svg>$/)
  assert.equal(svg.includes('<script'), false)
})

test('encodes different urls differently', async () => {
  const first = await profileQrSvg('http://localhost:3000/w/0x1111')
  const second = await profileQrSvg('http://localhost:3000/w/0x2222')

  assert.notEqual(first, second)
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npm test`
Expected: FAIL — cannot find module `../components/ProfileQr.tsx`.

- [ ] **Step 4: Write the implementation**

`web/components/ProfileQr.tsx`:

```tsx
import QRCode from 'qrcode'

/**
 * QR as an SVG string, generated on the server.
 *
 * No client JavaScript: the code is already markup by the time the page
 * arrives, which matters because the phone scanning it is the primary case.
 */
export async function profileQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#1C1917', light: '#FFFFFF' },
  })
}

export async function ProfileQr({ url }: { url: string }) {
  const svg = await profileQrSvg(url)

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-surface p-4 md:p-6">
      <h2 className="text-lg font-semibold leading-7">Share this profile</h2>
      <p className="mt-1 text-[13px] leading-5 text-[var(--color-fg-muted)]">
        Scanning this opens the same page.
      </p>
      <div
        className="mt-4 w-40"
        role="img"
        aria-label="QR code linking to this profile"
        // The SVG is generated from a URL this server built, not from user
        // input, and the test above asserts it carries no script element.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="mt-4 break-all font-mono text-[13px] leading-5">{url}</p>
    </section>
  )
}
```

- [ ] **Step 5: Run test to verify it passes, then commit**

Run: `cd web && npm test && npm run typecheck`
Expected: 2 QR tests pass, typecheck clean.

```bash
git add web/components/ProfileQr.tsx web/package.json web/package-lock.json web/test/components.qr.test.ts
git commit -m "feat(web): render a server-side qr code for the profile"
```

---

### Task 11: The route — `/w/[address]` with its loading and error states

**Files:**
- Create: `web/app/w/[address]/page.tsx`, `web/app/w/[address]/loading.tsx`, `web/app/w/[address]/error.tsx`, `web/app/w/[address]/not-found.tsx`
- Create: `web/lib/env.ts`
- Test: `web/test/env.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2 through 10.
- Produces: the route itself, plus `readEnv(source: Record<string, string | undefined>): AppEnv` where `interface AppEnv { chainId: number; rpcUrl: string; repoRoot: string; supabaseUrl: string; supabaseAnonKey: string; appOrigin: string }`.

- [ ] **Step 1: Write the failing test for the environment reader**

`web/test/env.test.ts`:

```ts
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readEnv } from '../lib/env.ts'

const complete = {
  CHAIN_ID: '31337',
  RPC_URL: 'http://127.0.0.1:8545',
  REPO_ROOT: '..',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_example',
  APP_ORIGIN: 'http://localhost:3000',
}

test('reads a complete environment', () => {
  assert.deepEqual(readEnv(complete), {
    chainId: 31337,
    rpcUrl: 'http://127.0.0.1:8545',
    repoRoot: '..',
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'sb_publishable_example',
    appOrigin: 'http://localhost:3000',
  })
})

test('names the missing variable rather than failing vaguely', () => {
  const { SUPABASE_ANON_KEY, ...incomplete } = complete
  assert.throws(() => readEnv(incomplete), /SUPABASE_ANON_KEY/)
})

test('rejects a chain id that is not a number', () => {
  assert.throws(() => readEnv({ ...complete, CHAIN_ID: 'base' }), /CHAIN_ID/)
})

test('refuses a database connection string in place of the anon key', () => {
  assert.throws(
    () => readEnv({ ...complete, SUPABASE_ANON_KEY: 'postgresql://user:pass@host:5432/postgres' }),
    /anon key/,
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test`
Expected: FAIL — cannot find module `../lib/env.ts`.

- [ ] **Step 3: Write the environment reader**

`web/lib/env.ts`:

```ts
export interface AppEnv {
  chainId: number
  rpcUrl: string
  repoRoot: string
  supabaseUrl: string
  supabaseAnonKey: string
  appOrigin: string
}

function required(source: Record<string, string | undefined>, name: string): string {
  const value = source[name]
  if (value === undefined || value === '') throw new Error(`${name} is not set`)
  return value
}

export function readEnv(source: Record<string, string | undefined>): AppEnv {
  const chainId = Number(required(source, 'CHAIN_ID'))
  if (!Number.isInteger(chainId)) throw new Error('CHAIN_ID is not an integer')

  const supabaseAnonKey = required(source, 'SUPABASE_ANON_KEY')
  if (supabaseAnonKey.startsWith('postgres')) {
    throw new Error(
      'SUPABASE_ANON_KEY holds a connection string. This application reads with the publishable anon key only.',
    )
  }

  return {
    chainId,
    rpcUrl: required(source, 'RPC_URL'),
    repoRoot: required(source, 'REPO_ROOT'),
    supabaseUrl: required(source, 'SUPABASE_URL'),
    supabaseAnonKey,
    appOrigin: required(source, 'APP_ORIGIN'),
  }
}
```

- [ ] **Step 4: Run the test, then write the route**

Run: `cd web && npm test`
Expected: 4 env tests pass.

`web/app/w/[address]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { AddressDisplay } from '../../../components/AddressDisplay.tsx'
import { PlatformChip } from '../../../components/PlatformChip.tsx'
import { ProfileQr } from '../../../components/ProfileQr.tsx'
import { RatingDistribution } from '../../../components/RatingDistribution.tsx'
import { RatingList } from '../../../components/RatingList.tsx'
import { VerificationResult } from '../../../components/VerificationResult.tsx'
import { normalizeAddress } from '../../../lib/address.ts'
import {
  createChainClient,
  explorerAddressUrl,
  explorerTxUrl,
  loadDeployment,
  readPlatformActivity,
  readWorkerChainState,
  type WorkerChainState,
} from '../../../lib/chain.ts'
import {
  createDatabaseClient,
  fetchRatingRows,
  fetchWorkerRow,
  toProfileView,
  type RatingRow,
  type WorkerRow,
} from '../../../lib/db.ts'
import { readEnv } from '../../../lib/env.ts'
import { selectState } from '../../../lib/score.ts'

export default async function WorkerProfilePage({
  params,
}: {
  params: Promise<{ address: string }>
}) {
  const { address } = await params
  const normalized = normalizeAddress(address)
  if (normalized === null) notFound()

  const env = readEnv(process.env)
  const deployment = loadDeployment(env.chainId, env.repoRoot)
  const chainClient = createChainClient(env.chainId, env.rpcUrl)
  const database = createDatabaseClient(env.supabaseUrl, env.supabaseAnonKey)

  // The two reads the architecture calls for, in parallel. Neither failure is
  // allowed to take the page down: a chain outage falls back to the cache, and
  // a database outage still shows the score, which is the chain's answer.
  const [chainResult, workerResult, ratingsResult] = await Promise.allSettled([
    readWorkerChainState(chainClient, deployment, normalized.display),
    fetchWorkerRow(database, normalized.queryKey),
    fetchRatingRows(database, normalized.queryKey),
  ])

  const chainState: WorkerChainState | null =
    chainResult.status === 'fulfilled' ? chainResult.value : null
  const workerRow: WorkerRow | null =
    workerResult.status === 'fulfilled' ? workerResult.value : null
  const ratingRows: RatingRow[] = ratingsResult.status === 'fulfilled' ? ratingsResult.value : []

  // Second round: the platform ids only become known once the ratings arrive.
  const platformIds = [...new Set(ratingRows.map((row) => row.platform_id))]
  const platformActivity =
    platformIds.length === 0 || chainState === null
      ? new Map<number, boolean>()
      : await readPlatformActivity(chainClient, deployment, platformIds).catch(
          () => new Map<number, boolean>(),
        )

  const profile = toProfileView(workerRow, ratingRows, platformActivity)

  const verdict = selectState({
    addressValid: true,
    chainRead: chainState === null ? 'failed' : 'ok',
    registered: chainState?.registered ?? false,
    hasWorkerRow: workerRow !== null,
    ratingCount: chainState?.ratingCount ?? profile.cachedCount ?? 0,
    hasDeactivatedIssuer: profile.hasDeactivatedIssuer,
  })

  if (verdict.state === 'not-found') notFound()

  const cachedScoreBps =
    profile.cachedScore === null ? 0 : Math.round(Number(profile.cachedScore) * 10000)
  const scoreBps = chainState === null ? cachedScoreBps : chainState.scoreBps
  const ratingCount = chainState?.ratingCount ?? profile.cachedCount ?? 0

  return (
    <main className="flex flex-col gap-12">
      <VerificationResult
        state={verdict.state}
        neutralRing={verdict.neutralRing}
        scoreBps={scoreBps}
        ratingCount={ratingCount}
        displayName={profile.displayName}
        headline={profile.headline}
        cachedAt={profile.cachedAt}
      />

      <div className="flex flex-col gap-6">
        <AddressDisplay
          address={normalized.display}
          explorerUrl={explorerAddressUrl(env.chainId, normalized.display)}
        />
        {profile.platforms.length === 0 ? null : (
          <div className="flex flex-wrap gap-3">
            {profile.platforms.map((platform) => (
              <PlatformChip key={platform.id} platform={platform} />
            ))}
          </div>
        )}
      </div>

      <RatingDistribution distribution={profile.distribution} />

      <RatingList
        ratings={profile.ratings}
        totalCount={ratingCount}
        explorerTxUrl={(txHash) => explorerTxUrl(env.chainId, txHash)}
      />

      <ProfileQr url={`${env.appOrigin}/w/${normalized.display}`} />
    </main>
  )
}
```

`web/app/w/[address]/not-found.tsx` — reached by `notFound()`, and it returns a 404 status while still rendering the designed state. It deliberately does not echo the address back:

```tsx
import { VerificationResult } from '../../../components/VerificationResult.tsx'

export default function WorkerNotFound() {
  return (
    <main>
      <VerificationResult
        state="not-found"
        neutralRing={false}
        scoreBps={0}
        ratingCount={0}
        displayName={null}
        headline={null}
        cachedAt={null}
      />
    </main>
  )
}
```

`web/app/w/[address]/loading.tsx` — skeletons matching the final layout, not a spinner:

```tsx
export default function LoadingProfile() {
  return (
    <main className="flex flex-col gap-12" aria-busy="true" aria-label="Loading profile">
      <div className="rounded-lg border border-[var(--color-border)] bg-surface p-4 md:p-6">
        <div className="h-8 w-56 rounded bg-[var(--color-border)]" />
        <div className="mt-4 h-20 w-64 rounded bg-[var(--color-border)]" />
      </div>
      <div className="rounded-lg border border-[var(--color-border)] bg-surface p-4 md:p-6">
        <div className="h-7 w-40 rounded bg-[var(--color-border)]" />
        <div className="mt-4 flex flex-col gap-2">
          {[5, 4, 3, 2, 1].map((row) => (
            <div key={row} className="h-3 rounded bg-[var(--color-border)]" />
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-[var(--color-border)] bg-surface p-4 md:p-6">
        <div className="h-7 w-44 rounded bg-[var(--color-border)]" />
        <div className="mt-4 flex flex-col gap-4">
          {[1, 2, 3].map((row) => (
            <div key={row} className="h-16 rounded bg-[var(--color-border)]" />
          ))}
        </div>
      </div>
    </main>
  )
}
```

`web/app/w/[address]/error.tsx` — must be a client component, and says what failed plus offers the retry:

```tsx
'use client'

export default function ProfileError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="rounded-lg border border-[var(--color-border)] bg-surface p-4 md:p-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold leading-8 text-[var(--color-danger)]">
        <span aria-label="Failed" role="img">
          ×
        </span>
        This profile could not be loaded
      </h1>
      <p className="mt-4 max-w-prose text-[var(--color-fg-muted)]">
        The record itself is unaffected — this page failed to read it. Trying again
        usually works.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 min-h-11 rounded-md bg-[var(--color-accent)] px-4 text-[15px] text-white transition-colors duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        Try again
      </button>
    </main>
  )
}
```

- [ ] **Step 5: Verify the route against real data, then commit**

Fill `web/.env.local` from `web/.env.example`. Get the Supabase URL and publishable key from the project dashboard (Project Settings, API) or through the Supabase MCP connection. Never put a connection string or a service role key in this file.

With anvil running, the contracts deployed, and the seed already run (Task 12 covers seeding — if it has not run yet, use any registered address and expect the empty state):

```bash
cd web && npm run dev
```

Check, in this order:

1. `/w/<a seeded worker address>` renders the hero, the spread, the platforms, the list, and the QR.
2. `/w/0x0000000000000000000000000000000000000001` renders the not-found state with a 404 status, and **no 3.00 anywhere** — that is the prior baseline leaking, and it means a score display is not gated on `registered`.
3. `/w/notanaddress` renders the same not-found state.
4. Stop anvil and reload a seeded profile: the partial state appears with the cached value, and the page still renders.
5. Restart anvil, then point `SUPABASE_URL` at a wrong host and reload: the score still renders, and the spread and list carry their own error or empty state.

```bash
git add web/app web/lib/env.ts web/test/env.test.ts
git commit -m "feat(web): add the public verification route"
```

---

### Task 12: Seed the demo data, verify on a phone, and record the milestone

**Files:**
- Modify: `README.md` (running the web app, what M3 delivers, the anvil-data caveat)
- Modify: `docs/DECISIONS.md` (append entries O and P)
- Modify: `seed/README.md` only if the run reveals a step it does not document

**Interfaces:**
- Consumes: the whole milestone.
- Produces: a demoable page and the honest framing around it.

- [ ] **Step 1: Seed the database**

Decide the write path first, and say which was used in the task report:

- **With `DATABASE_URL`** (preferred): take the connection string from the Supabase dashboard into `seed/.env`, then `cd seed && npm run seed`. This exercises `writeAll`, the untested write path the README names.
- **Through the Supabase MCP connection**: run the seed chain-only, then insert the rows over MCP. No password needed, but `writeAll` stays untested and the README's caveat stands.

Either way, anvil must be running with the contracts deployed, and `seed/.env` must hold anvil's own public test mnemonic — the default in `.env.example`.

Expected on a first pass: `ratings submitted 600`, 40 scores matching their independently computed expectation. A second pass reports `ratings submitted 0, already present 600`.

- [ ] **Step 2: Verify the phone case**

The milestone's own done-when. Find the machine's LAN address, set `APP_ORIGIN` to it, and serve a production build:

```bash
cd web && npm run build && npm run start -- --hostname 0.0.0.0
```

Open `http://<lan-ip>:3000/w/<seeded address>` on a phone with no wallet app installed. Check: it loads under a second, the layout is readable without zooming, tap targets are comfortable, and the QR scans from another phone to the same page.

Record the result — including the load time — in the task report. If it misses a second, report the number rather than tuning silently.

- [ ] **Step 3: Update the README**

Add to the "Running locally" section, after the seeding subsection:

````markdown
### Running the verification page

```bash
cd web
cp .env.example .env.local   # fill SUPABASE_URL and SUPABASE_ANON_KEY
npm install
npm run dev
```

Open `http://localhost:3000/w/<worker address>`. The page needs no wallet, no
sign-in, and no JavaScript to display its content: it is a server component
that reads the chain and the cache in parallel.

The publishable anon key is the only credential it holds. `seed/sql/001_schema.sql`
enables row level security with public read policies and revokes
`ratings.client` at column level, so the page reads exactly what a verifier is
meant to see.
````

Then extend the honest-limits list with the M3 caveat:

```markdown
- **The verification page currently serves anvil data.** Base Sepolia is
  deferred until the wallet holds testnet ETH, so the transaction hashes in a
  seeded profile point at a local chain. The page hides the block explorer link
  on chain id 31337 rather than linking somewhere dead, and it is not deployed
  publicly while this holds. The anvil rows are removed from Postgres before
  the real Base Sepolia run rather than stacked under it: the chain seed is
  idempotent, the database is not the place to hold two histories.
```

- [ ] **Step 4: Append the two decisions**

Add to `docs/DECISIONS.md`, following the existing entry format exactly — heading, prose, **Resolution**, **Cost**:

```markdown
## O. `web/` reads Postgres with the publishable anon key, not a connection string

`seed/` connects with `postgres.js` and a `DATABASE_URL`, so the obvious move
was to reuse it. The schema makes that the wrong call:
`seed/sql/001_schema.sql` enables row level security on all four tables, adds
`for select using (true)` policies to `platforms`, `workers`, and `ratings`,
revokes `select` on `ratings.client` from both `anon` and `authenticated`, and
leaves `sync_state` with neither policy nor grant.

That is a read model written for exactly one consumer: an unauthenticated
public page. Reading it with `@supabase/supabase-js` and the publishable key
means the column grant actually constrains the application — the page cannot
read `ratings.client` even by accident — and no database password has to reach
a deploy target.

**Resolution.** `web/lib/db.ts` uses `@supabase/supabase-js` with
`SUPABASE_ANON_KEY`. `web/lib/env.ts` rejects a value that starts with
`postgres`, so a connection string pasted into that variable fails loudly at
startup instead of quietly granting the app more reach than it should have.

**Cost.** One more dependency in `web/`, and two `as` casts where supabase-js
returns `unknown`-shaped rows.

## P. Every score display is gated on `isRegistered`

`RatingRegistry.scoreOf()` runs `previewScoreBps()` over whatever
`WorkerRegistry.statsOf()` returns, and `statsOf` answers with zeros for an
address it has never seen rather than reverting. The formula's prior then
dominates: with `PRIOR_SCORE_BPS = 30_000` and `PRIOR_WEIGHT = 5` from the
deploy script, an address that has never registered reads back as a confident
`3.00`.

Rendering that would be the worst kind of wrong — a made-up score on a page
whose entire purpose is checking whether a history is real.

**Resolution.** `selectState()` in `web/lib/score.ts` decides `not-found`
before any score is formatted, and `VerificationResult` renders no score in the
`not-found` and `empty` states. Two tests pin it: an anvil test asserting
`scoreOf` returns 30000 for an unregistered address, and a component test
asserting `3.00` never appears in the not-found hero.

**Cost.** None. The gate is one branch.
```

- [ ] **Step 5: Run everything, then commit**

Run:

```bash
cd web && npm run typecheck && npm test && npm run build
cd ../contracts && forge test
cd ../seed && npm run test:offline
```

Expected: all green. `forge test` still reports its 73 passing tests — nothing in this milestone touches the contracts.

```bash
git add README.md docs/DECISIONS.md seed/README.md
git commit -m "docs(m3): document the verification page and its two decisions"
```

---

## Verification checklist

Before calling the milestone done, confirm each item and say which check proved it:

- [ ] `/w/<seeded address>` renders hero, spread, platforms, list, and QR
- [ ] `/w/<unregistered address>` renders not-found with no score anywhere
- [ ] `/w/<malformed input>` renders not-found, not an error page
- [ ] Chain down: partial state, cached value, page still renders
- [ ] Database down: score still renders, spread and list degrade on their own
- [ ] A worker with fewer than 10 ratings shows amber, the icon, and the label
- [ ] Loading skeleton matches the final layout
- [ ] Keyboard reaches the copy button and every link, with a visible focus ring
- [ ] Page loads under a second on a phone with no wallet installed
- [ ] Amber text on white measured at 4.5:1 or better, not assumed
- [ ] The deactivated-issuer path is unit-tested but has no demo profile — stated, not hidden
- [ ] No `blockchain`, `wallet`, `gas`, or `token` in any user-facing string
- [ ] `npm run typecheck`, `npm test`, `npm run build` all clean
