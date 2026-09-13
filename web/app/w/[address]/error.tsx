'use client'

export default function ProfileError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="rounded-lg border border-[var(--color-border)] bg-surface p-4 md:p-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold leading-8 text-[var(--color-danger)]">
        <span aria-label="Failed" role="img">
          ×
        </span>
        This profile could not be loaded
      </h1>
      <p className="mt-4 max-w-prose text-[var(--color-fg-muted)]">
        The record itself is unaffected — this page failed to read it. Trying again
        usually works.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 min-h-11 rounded-md bg-[var(--color-accent)] px-4 text-[15px] text-white transition-colors duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        Try again
      </button>
    </main>
  )
}
