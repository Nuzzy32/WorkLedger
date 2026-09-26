'use client'

import { useState } from 'react'

/** Copies a value and says whether it worked. The clipboard can refuse. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copy() {
    try {
      if (!navigator?.clipboard?.writeText) throw new Error('no clipboard')
      await navigator.clipboard.writeText(value)
      setState('copied')
    } catch {
      setState('failed')
    }
    window.setTimeout(() => setState('idle'), 1500)
  }

  return (
    <span className="inline-flex items-center gap-3">
      <button type="button" onClick={copy} className="btn btn-primary">
        {label}
      </button>
      <span aria-live="polite" className="text-sm text-[var(--color-fg-muted)]">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : ''}
      </span>
    </span>
  )
}
