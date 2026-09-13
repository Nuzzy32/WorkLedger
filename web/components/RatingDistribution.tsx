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
