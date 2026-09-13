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
    <span className="inline-flex items-center gap-3">
      <button
        type="button"
        onClick={copy}
        data-address={address}
        aria-label={`Copy address ${address}`}
        className="min-h-11 rounded-md border border-[var(--color-border)] bg-surface px-3 font-mono text-[13px] leading-5 transition-colors duration-150 hover:bg-[var(--color-accent-weak)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        {short}
      </button>
      <span aria-live="polite" className="text-[13px] leading-5 text-[var(--color-fg-muted)]">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : ''}
      </span>
      {explorerUrl === null ? null : (
        <a
          href={explorerUrl}
          // inline-flex, because min-height does nothing to an inline box and
          // docs/DESIGN-SYSTEM.md asks for 44px on a phone.
          className="inline-flex min-h-11 items-center text-[13px] leading-5 text-[var(--color-accent)] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          View the record
        </a>
      )}
    </span>
  )
}
