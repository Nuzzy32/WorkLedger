import type { Metadata } from 'next'
import { PrivyShell } from '../../components/PrivyShell.tsx'
import { readEnv } from '../../lib/env.ts'

export const metadata: Metadata = { title: 'Dashboard | WorkLedger' }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? ''
  const { chainId } = readEnv(process.env)

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-5xl flex-col gap-6 px-4 pb-32 pt-28 md:gap-8 md:px-8 md:pt-32">
      {appId === '' ? (
        <section className="panel mx-auto max-w-2xl p-6 md:p-12">
          <h1 className="text-3xl font-semibold tracking-tighter">Sign-in is not set up here</h1>
          <p className="mt-4 text-lg text-[var(--color-fg-muted)]">
            This deployment has no sign-in configured. Public profiles still open at
            their own links.
          </p>
        </section>
      ) : (
        <PrivyShell appId={appId} chainId={chainId}>
          {children}
        </PrivyShell>
      )}
    </main>
  )
}
