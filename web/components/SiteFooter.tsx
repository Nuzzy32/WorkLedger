import Link from 'next/link'
import deployment from '../../contracts/deployments/base-sepolia.json'

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-border)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12 text-sm text-[var(--color-fg-muted)] md:flex-row md:items-center md:justify-between md:px-8">
        <p className="max-w-md">
          A portfolio project on the Base Sepolia test network. No real money, and every
          demo profile is a fictional person.
        </p>
        <div className="flex gap-6">
          <Link href="/#how" className="focus-ring rounded hover:text-[var(--color-fg)]">
            How it works
          </Link>
          <Link href="/dashboard" className="focus-ring rounded hover:text-[var(--color-fg)]">
            Dashboard
          </Link>
          <a
            href={`https://sepolia.basescan.org/address/${deployment.ratingRegistry}`}
            className="focus-ring rounded hover:text-[var(--color-fg)]"
          >
            Contracts
          </a>
        </div>
      </div>
    </footer>
  )
}
