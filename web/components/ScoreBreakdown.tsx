import { formatScore, previewScoreBps, ratingsToVerified } from '../lib/score.ts'

interface ScoreBreakdownProps {
  ratingCount: number
  scoreSum: number
  priorScoreBps: number
  priorWeight: number
  /** The chain's own answer. The breakdown explains it, never replaces it. */
  scoreBps: number
}

/**
 * The formula with this worker's numbers in it.
 *
 * Recomputes the score from the inputs and says so if the result ever differs
 * from the chain's: a breakdown that quietly disagreed with the number it
 * explains would be worse than none.
 */
export function ScoreBreakdown({
  ratingCount,
  scoreSum,
  priorScoreBps,
  priorWeight,
  scoreBps,
}: ScoreBreakdownProps) {
  const recomputed = previewScoreBps(ratingCount, scoreSum, priorScoreBps, priorWeight)
  const remaining = ratingsToVerified(ratingCount)
  const prior = formatScore(priorScoreBps)

  const inputs = [
    { label: 'Stars received', value: String(scoreSum) },
    { label: 'Ratings', value: String(ratingCount) },
    { label: 'Starting ratings', value: String(priorWeight) },
    { label: 'Starting score', value: prior },
  ]

  return (
    <section className="panel p-5 md:p-8">
      <h2 className="text-xl font-semibold tracking-tight md:text-2xl">How your score is computed</h2>
      <p className="mt-2 max-w-[60ch] text-[var(--color-fg-muted)]">
        Every profile starts with {priorWeight} ratings of {prior}, so one great job cannot
        make a perfect score. Your real ratings outweigh them as they add up.
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {inputs.map((input) => (
          <div
            key={input.label}
            className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4"
          >
            <dt className="text-sm text-[var(--color-fg-muted)]">{input.label}</dt>
            <dd className="tabular mt-1 text-2xl font-semibold tracking-tight">{input.value}</dd>
          </div>
        ))}
      </dl>

      <p className="tabular mt-6 overflow-x-auto whitespace-nowrap rounded-[20px] bg-[var(--color-bg)] p-4 font-mono text-sm">
        ({scoreSum} + {priorWeight} × {prior}) ÷ ({ratingCount} + {priorWeight}) ={' '}
        <span className="text-[var(--color-accent)]">{formatScore(recomputed)}</span>
      </p>

      {recomputed === scoreBps ? null : (
        <p className="mt-3 flex items-center gap-2 text-sm text-[var(--color-caution)]">
          <span aria-label="Mismatch" role="img">
            !
          </span>
          The record reads {formatScore(scoreBps)}. The record is the answer; this
          breakdown is out of date.
        </p>
      )}

      <p className="mt-6 text-[var(--color-fg)]">
        {remaining === 0
          ? 'Verified. Each new rating now moves your score a little less than the last.'
          : `${remaining} more ${remaining === 1 ? 'rating' : 'ratings'} and your profile stops showing as Unproven.`}
      </p>
    </section>
  )
}
