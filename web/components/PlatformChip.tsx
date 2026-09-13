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
      {platform.active ? null : (
        <span className="flex items-center gap-1 text-[var(--color-danger)]">
          <span aria-label="Deactivated" role="img">
            ×
          </span>
          No longer issuing
        </span>
      )}
    </span>
  )
}
