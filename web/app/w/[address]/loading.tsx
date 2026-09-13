export default function LoadingProfile() {
  return (
    <main className="flex flex-col gap-12" aria-busy="true" aria-label="Loading profile">
      <div className="rounded-lg border border-[var(--color-border)] bg-surface p-4 md:p-6">
        <div className="h-8 w-56 rounded bg-[var(--color-border)]" />
        <div className="mt-4 h-20 w-64 rounded bg-[var(--color-border)]" />
      </div>
      <div className="rounded-lg border border-[var(--color-border)] bg-surface p-4 md:p-6">
        <div className="h-7 w-40 rounded bg-[var(--color-border)]" />
        <div className="mt-4 flex flex-col gap-2">
          {[5, 4, 3, 2, 1].map((row) => (
            <div key={row} className="h-3 rounded bg-[var(--color-border)]" />
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-[var(--color-border)] bg-surface p-4 md:p-6">
        <div className="h-7 w-44 rounded bg-[var(--color-border)]" />
        <div className="mt-4 flex flex-col gap-4">
          {[1, 2, 3].map((row) => (
            <div key={row} className="h-16 rounded bg-[var(--color-border)]" />
          ))}
        </div>
      </div>
    </main>
  )
}
