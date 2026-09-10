import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { countByScore, RECENT_RATING_LIMIT, type Distribution } from './score.ts'

/** The columns of `workers` this page reads. */
export interface WorkerRow {
  display_name: string | null
  headline: string | null
  cached_score: string | number | null
  cached_count: number | null
  cached_at: string | null
}

type EmbeddedPlatform = { name: string } | { name: string }[] | null

/**
 * The columns of `ratings` this page reads.
 *
 * `client` is absent on purpose and cannot be added: seed/sql/001_schema.sql
 * revokes select on that column from anon.
 */
export interface RatingRow {
  job_id: string
  score: number
  comment: string | null
  job_title: string | null
  submitted_at: string
  tx_hash: string
  platform_id: number
  platforms: EmbeddedPlatform
}

export interface RatingView {
  jobId: string
  score: number
  comment: string | null
  jobTitle: string | null
  platformId: number
  platformName: string | null
  platformActive: boolean
  submittedAt: string
  txHash: string
}

export interface PlatformView {
  id: number
  name: string | null
  active: boolean
}

export interface ProfileView {
  displayName: string | null
  headline: string | null
  distribution: Distribution
  /** Newest first, capped at RECENT_RATING_LIMIT. */
  ratings: RatingView[]
  platforms: PlatformView[]
  cachedScore: string | null
  cachedCount: number | null
  cachedAt: string | null
  hasDeactivatedIssuer: boolean
}

function platformName(embedded: EmbeddedPlatform): string | null {
  if (embedded === null) return null
  if (Array.isArray(embedded)) return embedded[0]?.name ?? null
  return embedded.name
}

/**
 * Stitch a worker row, its ratings, and the chain's platform status into the
 * shape the components consume.
 *
 * The distribution counts every row, while the list is capped: an average
 * hides shape, and a ten-row sample of a forty-rating history would hide it
 * again.
 */
export function toProfileView(
  workerRow: WorkerRow | null,
  ratingRows: readonly RatingRow[],
  platformActivity: Map<number, boolean>,
): ProfileView {
  const ratings: RatingView[] = ratingRows.slice(0, RECENT_RATING_LIMIT).map((row) => ({
    jobId: row.job_id,
    score: row.score,
    comment: row.comment,
    jobTitle: row.job_title,
    platformId: row.platform_id,
    platformName: platformName(row.platforms),
    platformActive: platformActivity.get(row.platform_id) ?? false,
    submittedAt: row.submitted_at,
    txHash: row.tx_hash,
  }))

  const platforms: PlatformView[] = []
  for (const row of ratingRows) {
    if (platforms.some((platform) => platform.id === row.platform_id)) continue
    platforms.push({
      id: row.platform_id,
      name: platformName(row.platforms),
      // An id the chain did not return is treated as inactive. Claiming an
      // unknown issuer is active would be the wrong way to be wrong.
      active: platformActivity.get(row.platform_id) ?? false,
    })
  }
  platforms.sort((left, right) => left.id - right.id)

  const cachedScore = workerRow?.cached_score
  return {
    displayName: workerRow?.display_name ?? null,
    headline: workerRow?.headline ?? null,
    distribution: countByScore(ratingRows.map((row) => row.score)),
    ratings,
    platforms,
    cachedScore: cachedScore === null || cachedScore === undefined ? null : String(cachedScore),
    cachedCount: workerRow?.cached_count ?? null,
    cachedAt: workerRow?.cached_at ?? null,
    hasDeactivatedIssuer: platforms.some((platform) => !platform.active),
  }
}

/**
 * A read-only client on the publishable key.
 *
 * Row level security plus the column grants in seed/sql/001_schema.sql are the
 * whole authorisation model here. No connection string and no service role key
 * belongs in this application.
 */
export function createDatabaseClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, { auth: { persistSession: false } })
}

export async function fetchWorkerRow(
  client: SupabaseClient,
  queryKey: string,
): Promise<WorkerRow | null> {
  const { data, error } = await client
    .from('workers')
    .select('display_name, headline, cached_score, cached_count, cached_at')
    .eq('address', queryKey)
    .maybeSingle()

  if (error !== null) throw new Error(`workers read failed: ${error.message}`)
  return data as WorkerRow | null
}

export async function fetchRatingRows(
  client: SupabaseClient,
  queryKey: string,
): Promise<RatingRow[]> {
  const { data, error } = await client
    .from('ratings')
    .select('job_id, score, comment, job_title, submitted_at, tx_hash, platform_id, platforms(name)')
    .eq('worker', queryKey)
    .order('submitted_at', { ascending: false })

  if (error !== null) throw new Error(`ratings read failed: ${error.message}`)
  return (data ?? []) as RatingRow[]
}
