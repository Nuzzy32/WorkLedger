'use client'

import { useLoginWithOAuth, usePrivy, useWallets } from '@privy-io/react-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  createPublicClient,
  createWalletClient,
  custom,
  isAddressEqual,
  parseAbi,
  type Address,
} from 'viem'
import { anvil, baseSepolia } from 'viem/chains'

/** Read by the dashboard's server render to know whose profile to load. */
export const WORKER_COOKIE = 'wl_worker'

const registerAbi = parseAbi(['function register()'])

type SetupStep = 'idle' | 'funding' | 'signing' | 'confirming' | 'failed'

const STEP_TEXT: Record<Exclude<SetupStep, 'idle' | 'failed'>, string> = {
  funding: 'Preparing your account',
  signing: 'Creating your profile',
  confirming: 'Saving it to the public record',
}

function setWorkerCookie(address: string | null) {
  // Not a credential: it only names which public profile to render, and every
  // profile is public at /w/<address> anyway.
  document.cookie =
    address === null
      ? `${WORKER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
      : `${WORKER_COOKIE}=${address}; Path=/; Max-Age=2592000; SameSite=Lax`
}

interface AccountGateProps {
  chainId: number
  workerRegistry: Address
  /** The address the server rendered `children` for, from the cookie. */
  renderedFor: Address | null
  /** The chain's answer for `renderedFor`. null when it was not read. */
  registered: boolean | null
  children: React.ReactNode
}

export function AccountGate({
  chainId,
  workerRegistry,
  renderedFor,
  registered,
  children,
}: AccountGateProps) {
  const router = useRouter()
  const { ready, authenticated, user, logout, getAccessToken } = usePrivy()
  const { wallets } = useWallets()
  // Mounted on every render: it also completes the redirect back from Google.
  const { initOAuth, loading: oauthLoading, state: oauthState } = useLoginWithOAuth()
  const [signInError, setSignInError] = useState(false)
  const [step, setStep] = useState<SetupStep>('idle')
  const [justRegistered, setJustRegistered] = useState(false)
  const running = useRef(false)

  const address = (user?.wallet?.address ?? null) as Address | null
  const embedded = wallets.find((wallet) => wallet.walletClientType === 'privy')
  const matches = address !== null && renderedFor !== null && isAddressEqual(address, renderedFor)
  const needsSetup = matches && registered === false && !justRegistered

  // The server rendered for whoever the cookie named. Point it at this user.
  useEffect(() => {
    if (!ready) return
    if (!authenticated) {
      if (renderedFor !== null) {
        setWorkerCookie(null)
        router.refresh()
      }
      return
    }
    if (address !== null && !matches) {
      setWorkerCookie(address)
      router.refresh()
    }
  }, [ready, authenticated, address, matches, renderedFor, router])

  async function runSetup() {
    if (running.current || embedded === undefined) return
    running.current = true
    try {
      setStep('funding')
      const token = await getAccessToken()
      const response = await fetch('/api/register-gas', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      })
      // 409 means this wallet was funded before. It may still hold enough, so
      // registering is still worth trying; a real shortfall fails below.
      if (!response.ok && response.status !== 409) {
        throw new Error(`register-gas answered ${response.status}`)
      }
      const { status } = (await response.json()) as { status?: string }

      if (status !== 'registered') {
        setStep('signing')
        const chain = chainId === anvil.id ? anvil : baseSepolia
        await embedded.switchChain(chain.id)
        const provider = await embedded.getEthereumProvider()
        const account = embedded.address as Address
        const wallet = createWalletClient({ account, chain, transport: custom(provider) })
        const hash = await wallet.writeContract({
          address: workerRegistry,
          abi: registerAbi,
          functionName: 'register',
        })

        setStep('confirming')
        const reader = createPublicClient({ chain, transport: custom(provider) })
        const receipt = await reader.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error(`register ${hash} reverted`)
      }

      setJustRegistered(true)
      setStep('idle')
      router.refresh()
    } catch (error) {
      console.error('setup failed', error)
      setStep('failed')
    } finally {
      running.current = false
    }
  }

  // register() on first sign-in, without asking: it is the only way in.
  useEffect(() => {
    if (needsSetup && step === 'idle' && embedded !== undefined) void runSetup()
    // runSetup is left out on purpose: it is a new function every render, and
    // the ref guard already stops a second run.
  }, [needsSetup, step, embedded])

  async function signIn() {
    setSignInError(false)
    try {
      await initOAuth({ provider: 'google' })
    } catch {
      setSignInError(true)
    }
  }

  if (!ready) return <GateSkeleton />

  if (!authenticated) {
    const failed = signInError || oauthState.status === 'error'
    const busy = oauthLoading || oauthState.status === 'loading'
    return (
      <section className="panel animate-rise mx-auto max-w-2xl p-6 text-center md:p-12">
        <h1 className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-tight tracking-tighter">
          Your ratings, in one place
        </h1>
        <p className="mx-auto mt-4 max-w-[46ch] text-lg text-[var(--color-fg-muted)]">
          Sign in with Google. Your profile is created the first time, with nothing to
          install and no recovery phrase to keep.
        </p>
        <button type="button" onClick={signIn} disabled={busy} className="btn btn-primary mt-8">
          {busy ? 'Opening Google' : 'Sign in with Google'}
        </button>
        {failed ? (
          <p role="alert" className="mt-4 text-sm text-[var(--color-danger)]">
            Sign-in did not finish. Try again.
          </p>
        ) : null}
      </section>
    )
  }

  if (!matches) return <GateSkeleton label="Opening your profile" />

  if (needsSetup || step !== 'idle') {
    return (
      <section className="panel mx-auto max-w-2xl p-6 md:p-12" aria-live="polite">
        {step === 'failed' ? (
          <>
            <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tighter text-[var(--color-danger)]">
              <span aria-label="Failed" role="img">
                ×
              </span>
              Setup did not finish
            </h1>
            <p className="mt-4 max-w-[52ch] text-lg text-[var(--color-fg-muted)]">
              Nothing was lost. The last step can be run again safely.
            </p>
            <button type="button" onClick={() => setStep('idle')} className="btn btn-primary mt-8">
              Try again
            </button>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-semibold tracking-tighter">Setting up your profile</h1>
            <ol className="mt-8 flex flex-col gap-4">
              {(['funding', 'signing', 'confirming'] as const).map((item, index, all) => {
                const current = all.indexOf(step as (typeof all)[number])
                const done = index < current
                const active = index === current
                return (
                  <li key={item} className="flex items-center gap-4">
                    <span
                      aria-hidden="true"
                      className={`grid size-8 place-items-center rounded-full border text-sm ${
                        done
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                          : active
                            ? 'animate-pulse border-[var(--color-accent)] text-[var(--color-accent)]'
                            : 'border-[var(--color-border)] text-[var(--color-fg-muted)]'
                      }`}
                    >
                      {done ? '✓' : index + 1}
                    </span>
                    <span className={active || done ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)]'}>
                      {STEP_TEXT[item]}
                      {done ? <span className="sr-only"> (done)</span> : null}
                    </span>
                  </li>
                )
              })}
            </ol>
          </>
        )}
      </section>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-fg-muted)]">
        <span>Signed in{user?.google?.email ? ` as ${user.google.email}` : ''}</span>
        <button
          type="button"
          onClick={() => void logout()}
          className="focus-ring min-h-11 rounded-full px-4 underline underline-offset-4 hover:text-[var(--color-fg)]"
        >
          Sign out
        </button>
      </div>
      {children}
    </>
  )
}

function GateSkeleton({ label = 'Loading' }: { label?: string }) {
  return (
    <section
      className="panel mx-auto max-w-2xl animate-pulse p-6 md:p-12"
      aria-busy="true"
      aria-label={label}
    >
      <div className="h-10 w-3/4 rounded-full bg-white/[0.06]" />
      <div className="mt-6 h-5 w-full rounded-full bg-white/[0.06]" />
      <div className="mt-3 h-5 w-2/3 rounded-full bg-white/[0.06]" />
      <div className="mt-8 h-12 w-48 rounded-full bg-white/[0.06]" />
    </section>
  )
}
