'use client'

import { useState } from 'react'

/**
 * Truncated middle, monospace, click to copy, and an explorer link where one
 * exists. The only client component on this page: the clipboard has no server
 * equivalent.
 */
export function AddressDisplay({
  address,
  explorerUrl,
}: {
  address: string
  explorerUrl: string | null
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const short = `${address.slice(0, 8)}…${address.slice(-5)}`

  async function copy() {
    try {
      if (!navigator?.clipboard?.writeText) {
        setState('failed')
        window.setTimeout(() => setState('idle'), 1500)
        return
      }

      await navigator.clipboard.writeText(address)
      setState('copied')
      window.setTimeout(() => setState('idle'), 1500)
    } catch {
      setState('failed')
      window.setTimeout(() => setState('idle'), 1500)
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={copy}
        data-address={address}
        aria-label={`Copy address ${address}`}
        className="focus-ring min-h-11 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 font-mono text-sm transition-colors duration-150 hover:bg-[var(--color-accent-weak)]"
      >
        {short}
      </button>
      <span aria-live="polite" className="text-sm text-[var(--color-fg-muted)]">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : ''}
      </span>
      {explorerUrl === null ? null : (
        <a
          href={explorerUrl}
          // inline-flex, because min-height does nothing to an inline box and
          // a phone needs a 44px tap target.
          className="focus-ring inline-flex min-h-11 items-center rounded text-sm text-[var(--color-accent)] underline underline-offset-4"
        >
          View the record
        </a>
      )}
    </span>
  )
}
