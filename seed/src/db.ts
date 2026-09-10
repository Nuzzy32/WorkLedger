import postgres from 'postgres'
import type { Address, Hex } from 'viem'
import type { SeedRating } from './plan.ts'

export interface PlatformRow {
  id: number
  name: string
}

export interface WorkerRow {
  address: string
  display_name: string
  headline: string
  cached_score: string
  cached_count: number
  cached_at: Date
}

export interface RatingRow {
  job_id: string
  worker: string
  client: string
  platform_id: number
  score: number
  comment: string
  job_title: string
  submitted_at: Date
  tx_hash: string
}

export interface RowCtx {
  workerAddress: Address
  clientAddress: Address
  platformId: number
  txHash?: Hex
  submittedAt: Date
}

export interface AllRows {
  platforms: PlatformRow[]
  workers: WorkerRow[]
  ratings: RatingRow[]
}

/**
 * 43333 basis points reads as "4.33" for a numeric(4,2) column.
 *
 * Integer arithmetic, not `(scoreBps / 10_000).toFixed(2)`: some quotients are
 * not exactly representable as doubles, so a mathematically exact x.xx50 value
 * lands one unit low and rounds down. 44250 became "4.42" rather than "4.43".
 */
export function bpsToDecimal(scoreBps: number): string {
  const cents = Math.round(scoreBps / 100)
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

export function toPlatformRow(id: number, name: string): PlatformRow {
  return { id, name }
}

/**
 * Addresses are lowercased on the way in.
 *
 * docs/DATA-MODEL.md is explicit: checksummed and lowercase forms of one address
 * would silently create two rows, and the bug costs an afternoon to find.
 */
export function toWorkerRow(
  address: Address,
  displayName: string,
  headline: string,
  scoreBps: number,
  count: number,
): WorkerRow {
  return {
    address: address.toLowerCase(),
    display_name: displayName,
    headline,
    cached_score: bpsToDecimal(scoreBps),
    cached_count: count,
    cached_at: new Date(),
  }
}

/**
 * Build a rating row.
 *
 * @throws when `txHash` is missing. docs/DATA-MODEL.md: "Never write a rating to
 * Postgres without a confirmed transaction hash. A row with no tx_hash is a
 * rating that does not exist." Throwing is the point — a placeholder would put a
 * row in the table that points at nothing.
 */
export function toRatingRow(rating: SeedRating, ctx: RowCtx): RatingRow {
  if (ctx.txHash === undefined || ctx.txHash === '0x') {
    throw new Error(
      `refusing to build a rating row for job ${rating.jobId} without a confirmed tx_hash`,
    )
  }

  return {
    job_id: rating.jobId,
    worker: ctx.workerAddress.toLowerCase(),
    client: ctx.clientAddress.toLowerCase(),
    platform_id: ctx.platformId,
    score: rating.score,
    comment: rating.comment,
    job_title: rating.jobTitle,
    submitted_at: ctx.submittedAt,
    tx_hash: ctx.txHash,
  }
}

/**
 * Write every row, upserting so a re-run is harmless.
 *
 * Called only when DATABASE_URL is set. Ordering matters: platforms and workers
 * are inserted before ratings, which reference both by foreign key.
 */
export async function writeAll(databaseUrl: string, rows: AllRows): Promise<void> {
  const sql = postgres(databaseUrl, { max: 4 })

  try {
    await sql`
      insert into platforms ${sql(rows.platforms, 'id', 'name')}
      on conflict (id) do update set name = excluded.name
    `

    await sql`
      insert into workers ${sql(
        rows.workers,
        'address',
        'display_name',
        'headline',
        'cached_score',
        'cached_count',
        'cached_at',
      )}
      on conflict (address) do update set
        cached_score = excluded.cached_score,
        cached_count = excluded.cached_count,
        cached_at    = excluded.cached_at
    `

    // Chunked: a single 600-row insert is fine, but chunking keeps the statement
    // small enough to read in a Postgres log when something goes wrong.
    for (let i = 0; i < rows.ratings.length; i += 100) {
      const chunk = rows.ratings.slice(i, i + 100)
      await sql`
        insert into ratings ${sql(
          chunk,
          'job_id',
          'worker',
          'client',
          'platform_id',
          'score',
          'comment',
          'job_title',
          'submitted_at',
          'tx_hash',
        )}
        on conflict (job_id) do nothing
      `
    }
  } finally {
    await sql.end()
  }
}
