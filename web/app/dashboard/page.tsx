import { cookies } from 'next/headers'
import Link from 'next/link'
import { AccountGate, WORKER_COOKIE } from '../../components/AccountGate.tsx'
import { AddressDisplay } from '../../components/AddressDisplay.tsx'
import { CopyButton } from '../../components/CopyButton.tsx'
import { ProfileQr } from '../../components/ProfileQr.tsx'
import { RatingDistribution } from '../../components/RatingDistribution.tsx'
import { RatingList } from '../../components/RatingList.tsx'
import { ScoreBreakdown } from '../../components/ScoreBreakdown.tsx'
import { VerificationResult } from '../../components/VerificationResult.tsx'
import { normalizeAddress } from '../../lib/address.ts'
import {
  createChainClient,
  explorerAddressUrl,
  explorerTxUrl,
  loadDeployment,
  readScoringPrior,
  type ScoringPrior,
} from '../../lib/chain.ts'
import { readEnv } from '../../lib/env.ts'
import { loadProfile, type LoadedProfile } from '../../lib/profile.ts'

/**
 * The worker's own view. Everything on it is public data, the same record
 * /w/<address> shows; signing in only decides whose record to open and lets a
 * new worker register.
 */
export default async function DashboardPage() {
  const env = readEnv(process.env)
  const deployment = loadDeployment(env.chainId, env.repoRoot)
  const cookie = (await cookies()).get(WORKER_COOKIE)?.value ?? ''
  const worker = normalizeAddress(cookie)

  let loaded: LoadedProfile | null = null
  let prior: ScoringPrior | null = null
  if (worker !== null) {
    ;[loaded, prior] = await Promise.all([
      loadProfile(env, worker.display),
      readScoringPrior(createChainClient(env.chainId, env.rpcUrl), deployment).catch(() => null),
    ])
  }

  return (
    <AccountGate
      chainId={env.chainId}
      workerRegistry={deployment.workerRegistry}
      renderedFor={worker?.display ?? null}
      registered={loaded?.chainState?.registered ?? null}
    >
      {worker === null || loaded === null ? null : (
        <Dashboard
          address={worker.display}
          loaded={loaded}
          prior={prior}
          chainId={env.chainId}
          shareUrl={`${env.appOrigin}/w/${worker.display}`}
        />
      )}
    </AccountGate>
  )
}

function Dashboard({
  address,
  loaded,
  prior,
  chainId,
  shareUrl,
}: {
  address: `0x${string}`
  loaded: LoadedProfile
  prior: ScoringPrior | null
  chainId: number
  shareUrl: string
}) {
  const { verdict, profile, chainState, scoreBps, ratingCount, databaseError } = loaded
  // A just-registered worker has no ratings, so the public states would call
  // the profile empty. On their own dashboard it is theirs, never "not found".
  const state = verdict.state === 'not-found' ? 'empty' : verdict.state

  return (
    <>
      <VerificationResult
        state={state}
        neutralRing={verdict.neutralRing}
        scoreBps={scoreBps}
        ratingCount={ratingCount}
        displayName={profile.displayName ?? 'Your profile'}
        headline={profile.headline}
        cachedAt={profile.cachedAt}
      />

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <AddressDisplay address={address} explorerUrl={explorerAddressUrl(chainId, address)} />
        <Link href={`/w/${address}`} className="btn btn-ghost">
          Open public page
        </Link>
      </div>

      {chainState === null || prior === null ? (
        <section className="panel p-5 md:p-8">
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl">How your score is computed</h2>
          <p className="mt-4 flex items-center gap-2 text-[var(--color-caution)]">
            <span aria-label="Could not be loaded" role="img">
              !
            </span>
            The inputs could not be read just now. Reload to try again.
          </p>
        </section>
      ) : (
        <ScoreBreakdown
          ratingCount={chainState.ratingCount}
          scoreSum={chainState.scoreSum}
          priorScoreBps={prior.priorScoreBps}
          priorWeight={prior.priorWeight}
          scoreBps={chainState.scoreBps}
        />
      )}

      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr] md:gap-8">
        <RatingDistribution distribution={profile.distribution} databaseError={databaseError} />
        <div className="flex flex-col gap-4">
          <ProfileQr url={shareUrl} />
          <CopyButton value={shareUrl} label="Copy share link" />
        </div>
      </div>

      <RatingList
        ratings={profile.ratings}
        totalCount={ratingCount}
        databaseError={databaseError}
        explorerTxUrl={(txHash) => explorerTxUrl(chainId, txHash)}
      />
    </>
  )
}
