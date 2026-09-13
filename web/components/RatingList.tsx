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
    <section className="rounded-lg border border-[var(--color-border)] bg-surface p-4 md:p-6">
      <h2 className="text-lg font-semibold leading-7">Recent ratings</h2>

      {databaseError ? (
        <>
          <p className="mt-4 flex items-center gap-2 text-[var(--color-caution)]">
            <span aria-label="Could not be loaded" role="img">
              !
            </span>
            The list could not be loaded just now.
          </p>
          <p className="mt-1 max-w-prose text-[var(--color-fg-muted)]">
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
          <p className="mt-1 text-[13px] leading-5 text-[var(--color-fg-muted)]">
            Showing {ratings.length} of {totalCount}.
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
                    <span className="tabular text-lg font-semibold leading-7">
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
                    <span className="text-[13px] leading-5 text-[var(--color-fg-muted)]">
                      {formatDate(rating.submittedAt)}
                    </span>
                  </div>
                  {rating.comment === null ? null : (
                    <p className="mt-2 max-w-prose">{rating.comment}</p>
                  )}
                  <p className="mt-2 break-all font-mono text-[13px] leading-5 text-[var(--color-fg-muted)]">
                    {url === null ? (
                      // No explorer, so this string is the only route to the raw
                      // record. Truncated it would be useless; a link can afford
                      // to be short because the href carries the whole hash.
                      rating.txHash
                    ) : (
                      <a
                        href={url}
                        className="inline-flex min-h-11 items-center text-[var(--color-accent)] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
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
