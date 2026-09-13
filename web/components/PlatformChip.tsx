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
      {/* Only a known-inactive platform gets the treatment. `null` is an
          unread status, and an unread status is not a claim about anyone. */}
      {platform.active === false ? (
        <span className="flex items-center gap-1 text-[var(--color-danger)]">
          <span aria-label="Deactivated" role="img">
            ×
          </span>
          No longer issuing
        </span>
      ) : null}
    </span>
  )
}
