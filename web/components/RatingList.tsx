import type { RatingView } from '../lib/db.ts'
import { PlatformChip } from './PlatformChip.tsx'

interface RatingListProps {
  ratings: readonly RatingView[]
  totalCount: number
  explorerTxUrl: (txHash: string) => string | null
  /** The rating read failed. An empty list would claim the worker has none. */
  databaseError?: boolean
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

export function RatingList({
  ratings,
  totalCount,
  explorerTxUrl,
  databaseError = false,
}: RatingListProps) {
  return (
    <section className="panel p-5 md:p-8">
      <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Recent ratings</h2>

      {databaseError ? (
        <>
          <p className="mt-4 flex items-center gap-2 text-[var(--color-caution)]">
            <span aria-label="Could not be loaded" role="img">
              !
            </span>
            The list could not be loaded just now.
          </p>
          <p className="mt-1 max-w-[60ch] text-[var(--color-fg-muted)]">
            This says nothing about the worker. The score above is the chain&rsquo;s
            answer and stands on its own.
          </p>
        </>
      ) : ratings.length === 0 ? (
        <p className="mt-4 text-[var(--color-fg-muted)]">
          No ratings yet. Each one arrives after a platform confirms a finished job.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Showing {ratings.length} of {totalCount}.
          </p>
          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {ratings.map((rating) => {
              const url = explorerTxUrl(rating.txHash)

              return (
                <li
                  key={rating.jobId}
                  className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="tabular text-2xl font-semibold tracking-tight text-[var(--color-accent)]">
                      {rating.score}
                      {/* A bare number beside a job title is read out as "5". */}
                      <span className="sr-only"> out of 5</span>
                    </span>
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
                    <span className="text-sm text-[var(--color-fg-muted)]">
                      {formatDate(rating.submittedAt)}
                    </span>
                  </div>
                  {rating.comment === null ? null : (
                    <p className="mt-3 max-w-[60ch] text-[var(--color-fg)]/90">{rating.comment}</p>
                  )}
                  <p className="mt-2 break-all font-mono text-xs text-[var(--color-fg-muted)]">
                    {url === null ? (
                      // No explorer, so this string is the only route to the raw
                      // record. Truncated it would be useless; a link can afford
                      // to be short because the href carries the whole hash.
                      rating.txHash
                    ) : (
                      <a
                        href={url}
                        className="focus-ring inline-flex min-h-11 items-center rounded text-[var(--color-accent)] underline underline-offset-4"
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
