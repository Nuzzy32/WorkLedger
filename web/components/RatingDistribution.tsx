import type { Distribution } from '../lib/score.ts'

/**
 * Horizontal bars for 1 through 5.
 *
 * An average hides shape: forty 5s with ten 1s and fifty 4s average alike, and
 * the difference is what a client needs to see. Bars scale against the largest
 * bucket so the shape stays readable when one score dominates.
 */
export function RatingDistribution({
  distribution,
  databaseError = false,
}: {
  distribution: Distribution
  /** The rating read failed. Rows are missing, not absent. */
  databaseError?: boolean
}) {
  const total = distribution.reduce((sum, count) => sum + count, 0)

  if (databaseError) {
    return (
      <section className="panel p-5 md:p-8">
        <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Rating spread</h2>
        <p className="mt-4 flex items-center gap-2 text-[var(--color-caution)]">
          <span aria-label="Could not be loaded" role="img">
            !
          </span>
          The spread could not be loaded just now.
        </p>
        <p className="mt-1 max-w-[60ch] text-[var(--color-fg-muted)]">
          This says nothing about the worker. The score above is the chain&rsquo;s
          answer and stands on its own.
        </p>
      </section>
    )
  }

  if (total === 0) {
    return (
      <section className="panel p-5 md:p-8">
        <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Rating spread</h2>
        <p className="mt-4 text-[var(--color-fg-muted)]">
          No ratings to show yet. Each finished job adds one row here.
        </p>
      </section>
    )
  }

  const largest = Math.max(...distribution)

  return (
    <section className="panel p-5 md:p-8">
      <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Rating spread</h2>
      <ul className="mt-6 flex flex-col gap-3">
        {[5, 4, 3, 2, 1].map((score) => {
          const count = distribution[score - 1] ?? 0
          const width = largest === 0 ? 0 : Math.round((count / largest) * 100)

          return (
            <li key={score} data-score={score} className="flex items-center gap-3">
              <span className="tabular w-4 font-mono text-sm text-[var(--color-fg-muted)]">
                {score}
              </span>
              {/* No background track: the bar's own length is the reading. */}
              <span className="flex-1">
                <span
                  className="block h-2.5 min-w-1 rounded-full bg-[var(--color-accent)]"
                  style={{ width: `${width}%` }}
                />
              </span>
              <span className="tabular w-10 text-right font-mono text-sm">{count}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
