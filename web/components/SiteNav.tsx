import Link from 'next/link'

/** Floating glass pill. One line at every width: the links drop before it wraps. */
export function SiteNav() {
  return (
    <header className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <nav
        aria-label="Main"
        className="glass flex h-14 w-full max-w-3xl items-center justify-between rounded-full pl-5 pr-2"
      >
        <Link href="/" className="focus-ring rounded-full text-[15px] font-semibold tracking-tight">
          WorkLedger
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/#how"
            className="focus-ring hidden rounded-full px-4 py-2 text-sm text-[var(--color-fg-muted)] transition-colors duration-150 hover:text-[var(--color-fg)] sm:inline-flex"
          >
            How it works
          </Link>
          <Link
            href="/#profiles"
            className="focus-ring hidden rounded-full px-4 py-2 text-sm text-[var(--color-fg-muted)] transition-colors duration-150 hover:text-[var(--color-fg)] sm:inline-flex"
          >
            Demo profiles
          </Link>
          <Link href="/dashboard" className="btn btn-primary min-h-10 px-5 text-sm">
            Dashboard
          </Link>
        </div>
      </nav>
    </header>
  )
}
