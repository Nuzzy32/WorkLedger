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
  const [copied, setCopied] = useState(false)
  const short = `${address.slice(0, 8)}…${address.slice(-5)}`

  async function copy() {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
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
        {copied ? 'Copied' : ''}
      </span>
      {explorerUrl === null ? null : (
        <a
          href={explorerUrl}
          className="min-h-11 text-[13px] leading-5 text-[var(--color-accent)] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          View the record
        </a>
      )}
    </span>
  )
}
