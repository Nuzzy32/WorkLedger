import { getAddress, isAddress, type Address } from 'viem'

export interface NormalizedAddress {
  /** Lowercase form. docs/DATA-MODEL.md allows no other form as a query key. */
  queryKey: string
  /** Checksummed form, for display only. */
  display: Address
}

/**
 * Validate a route parameter and return both forms of the address.
 *
 * Returns null rather than throwing: a mistyped link is the common case, and
 * docs/DESIGN-SYSTEM.md renders an unknown address as a plain "not found"
 * rather than as an error. viem's isAddress rejects a mixed-case address whose
 * checksum does not hold, which is exactly the mangled-link case.
 */
export function normalizeAddress(raw: string): NormalizedAddress | null {
  if (!isAddress(raw)) return null

  const display = getAddress(raw)
  return { queryKey: display.toLowerCase(), display }
}
