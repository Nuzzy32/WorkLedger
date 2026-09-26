import Link from 'next/link'
import { DEMO_PROFILES } from '../lib/demo.ts'

export default function HomePage() {
  return (
    <main className="flex flex-col gap-12 py-12">
      <section>
        <h1 className="text-2xl font-semibold leading-8">WorkLedger</h1>
        <p className="mt-4 max-w-prose text-[var(--color-fg-muted)]">
          A worker&apos;s rating history, checkable by anyone holding the link. The
          ratings come from several platforms, and no single one of them owns the
          record.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold leading-7">Two profiles to compare</h2>
        <p className="mt-1 max-w-prose text-[var(--color-fg-muted)]">
          Both workers have a score. Open each one and look at how much evidence
          stands behind it.
        </p>
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {DEMO_PROFILES.map((profile) => (
            <li key={profile.address}>
              <Link
                href={`/w/${profile.address}`}
                className="block min-h-11 rounded-lg border border-[var(--color-border)] bg-surface p-4 transition-colors duration-150 hover:border-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] md:p-6"
              >
                <span className="block font-semibold">{profile.name}</span>
                <span className="mt-1 block text-[var(--color-fg-muted)]">{profile.note}</span>
                <span className="mt-4 block text-[13px] leading-5 text-[var(--color-accent)]">
                  Open the profile →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="max-w-prose text-[13px] leading-5 text-[var(--color-fg-muted)]">
        These are demo profiles with fictional names, on a test network. Any
        profile opens at <span className="font-mono">/w/&lt;address&gt;</span>.
      </p>
    </main>
  )
}
