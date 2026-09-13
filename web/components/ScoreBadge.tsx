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
  // `partial` is not a verdict. Verified and unproven are judgements about a
  // history this page could not read, so it says what it has instead: the last
  // value it saved. Label and icon carry that, never the ring alone.
  const partial = state === 'partial'
  const tone = partial || neutralRing ? 'neutral' : state === 'verified' ? 'verified' : 'unproven'
  const label = partial ? 'Last known' : state === 'verified' ? 'Verified' : 'Unproven'
  const icon = partial ? '↺' : state === 'verified' ? '✓' : '!'

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
        {/* Both notes when both apply: they answer different questions, and a
            small sample stays a small sample whoever issued it. */}
        {state === 'unproven' ? (
          <p className="mt-1 text-[13px] leading-5 text-[var(--color-fg-muted)]">
            Fewer than 10 ratings. Too small a sample to judge.
          </p>
        ) : null}
      </div>
    </div>
  )
}
