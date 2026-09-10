export default function HomePage() {
  return (
    <main className="py-12">
      <h1 className="text-2xl font-semibold">WorkLedger</h1>
      <p className="mt-4 max-w-prose text-[var(--color-fg-muted)]">
        A worker&apos;s rating history, checkable by anyone holding the link. Open a
        profile at <span className="font-mono text-[13px]">/w/&lt;address&gt;</span>.
      </p>
    </main>
  )
}
