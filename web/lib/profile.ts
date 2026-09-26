import type { Address } from 'viem'
import {
  createChainClient,
  loadDeployment,
  readPlatformActivity,
  readWorkerChainState,
  type WorkerChainState,
} from './chain.ts'
import {
  createDatabaseClient,
  fetchRatingRows,
  fetchWorkerRow,
  toProfileView,
  type ProfileView,
  type RatingRow,
  type WorkerRow,
} from './db.ts'
import type { AppEnv } from './env.ts'
import { selectState, type ProfileVerdict } from './score.ts'

export interface LoadedProfile {
  verdict: ProfileVerdict
  profile: ProfileView
  /** null when the chain read failed. */
  chainState: WorkerChainState | null
  /** null when nothing was read and nothing was cached. Never formatted. */
  scoreBps: number | null
  ratingCount: number
  /** The rating read failed. Rows are missing, not absent. */
  databaseError: boolean
}

/**
 * Everything one worker's page shows, read from the chain and Postgres.
 *
 * Shared by the public profile and the worker's own dashboard, so the two can
 * never tell the same worker two different stories.
 */
export async function loadProfile(env: AppEnv, address: Address): Promise<LoadedProfile> {
  const queryKey = address.toLowerCase()
  const deployment = loadDeployment(env.chainId, env.repoRoot)
  const chainClient = createChainClient(env.chainId, env.rpcUrl)
  const database = createDatabaseClient(env.supabaseUrl, env.supabaseAnonKey)

  // The two reads the architecture calls for, in parallel. Neither failure is
  // allowed to take the page down: a chain outage falls back to the cache, and
  // a database outage still shows the score, which is the chain's answer.
  const [chainResult, workerResult, ratingsResult] = await Promise.allSettled([
    readWorkerChainState(chainClient, deployment, address),
    fetchWorkerRow(database, queryKey),
    fetchRatingRows(database, queryKey),
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

  // workers.cached_score is nullable, and a row written before its first score
  // sync has none. Null stays null all the way to the hero: a 0.00 would read
  // as a score this worker earned.
  const cachedScoreBps =
    profile.cachedScore === null ? null : Math.round(Number(profile.cachedScore) * 10000)

  return {
    verdict,
    profile,
    chainState,
    scoreBps: chainState === null ? cachedScoreBps : chainState.scoreBps,
    ratingCount: chainState?.ratingCount ?? profile.cachedCount ?? 0,
    databaseError,
  }
}
