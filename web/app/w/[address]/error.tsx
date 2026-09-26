'use client'

export default function ProfileError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-32 pt-28 md:px-8 md:pt-32">
      <section className="panel p-5 md:p-10">
        <h1 className="flex items-center gap-3 text-[clamp(2rem,4vw,3rem)] font-semibold leading-tight tracking-tighter text-[var(--color-danger)]">
          <span aria-label="Failed" role="img">
            ×
          </span>
          This profile could not be loaded
        </h1>
        <p className="mt-4 max-w-[60ch] text-lg text-[var(--color-fg-muted)]">
          The record itself is unaffected. This page failed to read it, and trying again
          usually works.
        </p>
        <button type="button" onClick={reset} className="btn btn-primary mt-8">
          Try again
        </button>
      </section>
    </main>
  )
}
