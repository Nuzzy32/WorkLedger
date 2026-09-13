import { notFound } from 'next/navigation'
import { AddressDisplay } from '../../../components/AddressDisplay.tsx'
import { PlatformChip } from '../../../components/PlatformChip.tsx'
import { ProfileQr } from '../../../components/ProfileQr.tsx'
import { RatingDistribution } from '../../../components/RatingDistribution.tsx'
import { RatingList } from '../../../components/RatingList.tsx'
import { VerificationResult } from '../../../components/VerificationResult.tsx'
import { normalizeAddress } from '../../../lib/address.ts'
import {
  createChainClient,
  explorerAddressUrl,
  explorerTxUrl,
  loadDeployment,
  readPlatformActivity,
  readWorkerChainState,
  type WorkerChainState,
} from '../../../lib/chain.ts'
import {
  createDatabaseClient,
  fetchRatingRows,
  fetchWorkerRow,
  toProfileView,
  type RatingRow,
  type WorkerRow,
} from '../../../lib/db.ts'
import { readEnv } from '../../../lib/env.ts'
import { selectState } from '../../../lib/score.ts'

export default async function WorkerProfilePage({
  params,
}: {
  params: Promise<{ address: string }>
}) {
  const { address } = await params
  const normalized = normalizeAddress(address)
  if (normalized === null) notFound()

  const env = readEnv(process.env)
  const deployment = loadDeployment(env.chainId, env.repoRoot)
  const chainClient = createChainClient(env.chainId, env.rpcUrl)
  const database = createDatabaseClient(env.supabaseUrl, env.supabaseAnonKey)

  // The two reads the architecture calls for, in parallel. Neither failure is
  // allowed to take the page down: a chain outage falls back to the cache, and
  // a database outage still shows the score, which is the chain's answer.
  const [chainResult, workerResult, ratingsResult] = await Promise.allSettled([
    readWorkerChainState(chainClient, deployment, normalized.display),
    fetchWorkerRow(database, normalized.queryKey),
    fetchRatingRows(database, normalized.queryKey),
  ])

  const chainState: WorkerChainState | null =
    chainResult.status === 'fulfilled' ? chainResult.value : null
  const workerRow: WorkerRow | null =
    workerResult.status === 'fulfilled' ? workerResult.value : null
  const ratingRows: RatingRow[] = ratingsResult.status === 'fulfilled' ? ratingsResult.value : []
  // The read that backs the distribution and the list. A rejection here is a
  // database outage, which must not look like a worker with no ratings.
  const databaseError = ratingsResult.status === 'rejected'

  // Second round: the platform ids only become known once the ratings arrive.
  const platformIds = [...new Set(ratingRows.map((row) => row.platform_id))]
  // null means the chain was not read. An empty map means it was read and had
  // nothing to say. The page may only report what it read, so the two cannot
  // collapse into one value.
  const platformActivity: Map<number, boolean> | null =
    chainState === null
      ? null
      : platformIds.length === 0
        ? new Map<number, boolean>()
        : await readPlatformActivity(chainClient, deployment, platformIds).catch(() => null)

  const profile = toProfileView(workerRow, ratingRows, platformActivity)

  const verdict = selectState({
    addressValid: true,
    chainRead: chainState === null ? 'failed' : 'ok',
    registered: chainState?.registered ?? false,
    hasWorkerRow: workerRow !== null,
    ratingCount: chainState?.ratingCount ?? profile.cachedCount ?? 0,
    hasDeactivatedIssuer: profile.hasDeactivatedIssuer,
  })

  if (verdict.state === 'not-found') notFound()

  // workers.cached_score is nullable, and a row written before its first score
  // sync has none. Null stays null all the way to the hero: a 0.00 would read
  // as a score this worker earned.
  const cachedScoreBps =
    profile.cachedScore === null ? null : Math.round(Number(profile.cachedScore) * 10000)
  const scoreBps = chainState === null ? cachedScoreBps : chainState.scoreBps
  const ratingCount = chainState?.ratingCount ?? profile.cachedCount ?? 0

  return (
    <main className="flex flex-col gap-12">
      <VerificationResult
        state={verdict.state}
        neutralRing={verdict.neutralRing}
        scoreBps={scoreBps}
        ratingCount={ratingCount}
        displayName={profile.displayName}
        headline={profile.headline}
        cachedAt={profile.cachedAt}
      />

      <div className="flex flex-col gap-6">
        <AddressDisplay
          address={normalized.display}
          explorerUrl={explorerAddressUrl(env.chainId, normalized.display)}
        />
        {profile.platforms.length === 0 ? null : (
          <div className="flex flex-wrap gap-3">
            {profile.platforms.map((platform) => (
              <PlatformChip key={platform.id} platform={platform} />
            ))}
          </div>
        )}
      </div>

      <RatingDistribution distribution={profile.distribution} databaseError={databaseError} />

      <RatingList
        ratings={profile.ratings}
        totalCount={ratingCount}
        databaseError={databaseError}
        explorerTxUrl={(txHash) => explorerTxUrl(env.chainId, txHash)}
      />

      <ProfileQr url={`${env.appOrigin}/w/${normalized.display}`} />
    </main>
  )
}
