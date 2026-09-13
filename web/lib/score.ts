/** docs/DESIGN-SYSTEM.md: under ten ratings the profile is unproven. */
export const UNPROVEN_THRESHOLD = 10

/** How many ratings the public page lists. The distribution still counts all of them. */
export const RECENT_RATING_LIMIT = 10

/**
 * Basis points to a two-decimal score.
 *
 * Uses the same integer arithmetic as bpsToDecimal in seed/src/db.ts to
 * ensure the verification page's cached score and live chain score never
 * disagree. See docs/DECISIONS.md entry K: some quotients like 44250 basis
 * points are not representable exactly as doubles, so naive floating-point
 * division and toFixed round the wrong way. The solution is integer arithmetic:
 * round the cents to a whole number, then format from integers.
 */
export function formatScore(scoreBps: number): string {
  const cents = Math.round(scoreBps / 100)
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
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
    // neutralRing is false on purpose: a chain read that failed told us nothing
    // about any issuer, so the partial state carries no deactivation claim.
    // ScoreBadge draws the partial state neutral anyway, by its own label.
    return signals.hasWorkerRow ? { state: 'partial', neutralRing: false } : notFound
  }

  if (!signals.registered && !signals.hasWorkerRow) return notFound
  if (signals.ratingCount === 0) return { state: 'empty', neutralRing: false }

  return {
    state: signals.ratingCount < UNPROVEN_THRESHOLD ? 'unproven' : 'verified',
    neutralRing: signals.hasDeactivatedIssuer,
  }
}
