import { keccak256, stringToBytes, type Hex } from 'viem'

export interface SeedRating {
  index: number
  jobId: Hex
  workerIndex: number
  clientIndex: number
  platformIndex: number
  score: number
  comment: string
  jobTitle: string
  completedAt: bigint
}

export interface SeedPlan {
  platforms: { nameHash: Hex; name: string }[]
  ratings: SeedRating[]
}

const WORKER_COUNT = 40
const CLIENT_COUNT = 20
const RATING_COUNT = 600

/** Prior constants, fixed by docs/CONTRACTS.md and immutable on chain. */
const PRIOR_SCORE_BPS = 30_000
const PRIOR_WEIGHT = 5

/** Invented platform names. No real company, no personal data. */
const PLATFORM_NAMES = ['Kurirku', 'Tukangku', 'Rampung'] as const

const JOB_TITLES = [
  'Same-day parcel delivery',
  'Apartment deep clean',
  'Motorbike service call',
  'Grocery run',
  'Furniture assembly',
  'Air-conditioner service',
  'Document courier',
  'Catering delivery',
] as const

const COMMENTS_HIGH = [
  'Arrived early and kept me updated.',
  'Careful with a fragile package.',
  'Polite and quick, would book again.',
  'Handled a tricky address without fuss.',
] as const

const COMMENTS_MID = [
  'Fine overall, arrived a little late.',
  'Job done, communication could be better.',
] as const

const COMMENTS_LOW = [
  'Very late with no message.',
  'Package arrived damaged.',
] as const

/**
 * Mulberry32 — a small deterministic PRNG.
 *
 * Seeded from the seed tag so the whole dataset is reproducible. Math.random
 * would make the plan unrepeatable and break resumption.
 */
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedFromTag(tag: string): number {
  let h = 2166136261
  for (let i = 0; i < tag.length; i++) {
    h ^= tag.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Weighted toward 4 and 5, matching a real rating pool's ~4.6 average. */
function healthyScore(rng: () => number): number {
  const roll = rng()
  if (roll < 0.55) return 5
  if (roll < 0.8) return 4
  if (roll < 0.92) return 3
  if (roll < 0.975) return 2
  return 1
}

/** Deliberately mixed: genuinely good and genuinely bad jobs on one profile. */
function mixedScore(rng: () => number): number {
  const roll = rng()
  if (roll < 0.45) return 5
  if (roll < 0.6) return 4
  if (roll < 0.7) return 3
  if (roll < 0.85) return 2
  return 1
}

function pick<T>(items: readonly T[], rng: () => number): T {
  const item = items[Math.floor(rng() * items.length)]
  // Index is always in [0, items.length) by construction of Math.floor(rng() * length)
  // with rng() in [0, 1), so this can never read past the array.
  return item!
}

function commentFor(score: number, rng: () => number): string {
  if (score >= 4) return pick(COMMENTS_HIGH, rng)
  if (score === 3) return pick(COMMENTS_MID, rng)
  return pick(COMMENTS_LOW, rng)
}

/**
 * Build the demo dataset.
 *
 * Pure: no clock, no network, no unseeded randomness. The same `seedTag` always
 * yields the same 600 records, which is what lets an interrupted run resume.
 *
 * Shape per docs/DATA-MODEL.md:
 *   - workers 0 and 1 get mixed histories (at least 10 ratings, spanning 1..5)
 *   - worker 39 gets exactly 2 ratings, to exercise the "unproven" state
 *   - the rest are weighted toward 4 and 5
 */
export function buildPlan(seedTag: string): SeedPlan {
  const rng = makeRng(seedFromTag(seedTag))

  const MIXED_WORKERS = new Set([0, 1])
  const SPARSE_WORKER = WORKER_COUNT - 1
  const SPARSE_RATINGS = 2

  // Assign each rating slot to a worker before choosing scores, so the counts
  // the tests assert on are exact rather than probabilistic.
  const workerSlots: number[] = []
  for (let i = 0; i < SPARSE_RATINGS; i++) workerSlots.push(SPARSE_WORKER)
  for (const w of MIXED_WORKERS) for (let i = 0; i < 15; i++) workerSlots.push(w)

  const remaining = RATING_COUNT - workerSlots.length
  const ordinary: number[] = []
  for (let w = 0; w < WORKER_COUNT; w++) {
    if (w === SPARSE_WORKER || MIXED_WORKERS.has(w)) continue
    ordinary.push(w)
  }
  for (let i = 0; i < remaining; i++) {
    // ordinary is non-empty (WORKER_COUNT - 1 - MIXED_WORKERS.size entries), so
    // i % ordinary.length always indexes an existing element.
    workerSlots.push(ordinary[i % ordinary.length]!)
  }

  const ratings: SeedRating[] = workerSlots.map((workerIndex, index) => {
    const score = MIXED_WORKERS.has(workerIndex) ? mixedScore(rng) : healthyScore(rng)

    // Clients derive from a disjoint index range in accounts.ts (10-29 vs.
    // workers' 100-139), so a worker and client never resolve to the same
    // on-chain address even when these local array indices coincide.
    const clientIndex = Math.floor(rng() * CLIENT_COUNT)
    const platformIndex = Math.floor(rng() * PLATFORM_NAMES.length)

    return {
      index,
      jobId: keccak256(stringToBytes(`${seedTag}:${index}`)),
      workerIndex,
      clientIndex,
      platformIndex,
      score,
      comment: commentFor(score, rng),
      jobTitle: pick(JOB_TITLES, rng),
      // Backdated in the attestation for plausibility. Not stored on chain —
      // the Rating struct has no completedAt field.
      completedAt: BigInt(1_700_000_000 - index * 3_600),
    }
  })

  return {
    platforms: PLATFORM_NAMES.map((name) => ({ name, nameHash: keccak256(stringToBytes(name)) })),
    ratings,
  }
}

/**
 * Reproduce the contract's scoring formula off chain, for verification.
 *
 * scoreBps = (scoreSum * 10000 + PRIOR_WEIGHT * PRIOR_SCORE_BPS) / (count + PRIOR_WEIGHT)
 * Integer division, matching Solidity truncation.
 */
export function expectedScoreBps(
  ratings: readonly { workerIndex: number; score: number }[],
  workerIndex: number,
): number {
  const mine = ratings.filter((r) => r.workerIndex === workerIndex)
  const sum = mine.reduce((acc, r) => acc + r.score, 0)
  const numerator = sum * 10_000 + PRIOR_WEIGHT * PRIOR_SCORE_BPS
  return Math.floor(numerator / (mine.length + PRIOR_WEIGHT))
}
