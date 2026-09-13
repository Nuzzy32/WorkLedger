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
  /** null when nothing was read and nothing was cached. Never formatted. */
  scoreBps: number | null
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
        ) : scoreBps === null ? (
          <p className="flex items-center gap-2 text-[15px]">
            <span aria-label="No score available" role="img">
              —
            </span>
            No score to show. The chain could not be reached and no score was saved
            here before now.
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
