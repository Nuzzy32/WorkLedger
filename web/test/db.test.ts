import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { toProfileView, type RatingRow, type WorkerRow } from '../lib/db.ts'

const worker: WorkerRow = {
  display_name: 'Rani Wibowo',
  headline: 'Courier, three cities',
  cached_score: '4.32',
  cached_count: 12,
  cached_at: '2026-09-11T02:00:00.000Z',
}

function rating(index: number, score: number, platformId: number): RatingRow {
  return {
    job_id: `0x${index.toString(16).padStart(64, '0')}`,
    score,
    comment: `comment ${index}`,
    job_title: 'Same-day delivery',
    submitted_at: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    tx_hash: `0x${'cd'.repeat(32)}`,
    platform_id: platformId,
    platforms: { name: `Platform ${platformId}` },
  }
}

// Twelve rows, so the ten-row list cannot be mistaken for the whole history.
const ratings: RatingRow[] = [
  ...Array.from({ length: 9 }, (_, index) => rating(index, 5, 1)),
  rating(9, 4, 2),
  rating(10, 1, 2),
  rating(11, 3, 3),
]

test('counts the distribution over every rating, not just the listed ones', () => {
  const view = toProfileView(worker, ratings, new Map([[1, true], [2, true], [3, true]]))

  assert.deepEqual(view.distribution, [1, 0, 1, 1, 9])
  assert.equal(view.distribution.reduce((sum, count) => sum + count, 0), 12)
  assert.equal(view.ratings.length, 10)
})

test('keeps the order it was given, newest first', () => {
  const newestFirst = [...ratings].reverse()
  const view = toProfileView(worker, newestFirst, new Map([[1, true], [2, true], [3, true]]))

  assert.equal(view.ratings[0]?.jobId, newestFirst[0]?.job_id)
})

test('collects the platforms in the history with their chain status', () => {
  const view = toProfileView(worker, ratings, new Map([[1, true], [2, false], [3, true]]))

  assert.deepEqual(
    view.platforms.map((platform) => [platform.id, platform.name, platform.active]),
    [
      [1, 'Platform 1', true],
      [2, 'Platform 2', false],
      [3, 'Platform 3', true],
    ],
  )
  assert.equal(view.hasDeactivatedIssuer, true)
})

test('reports no deactivated issuer when every platform is active', () => {
  const view = toProfileView(worker, ratings, new Map([[1, true], [2, true], [3, true]]))
  assert.equal(view.hasDeactivatedIssuer, false)
})

test('treats a platform absent from the chain map as inactive', () => {
  const view = toProfileView(worker, [rating(0, 5, 7)], new Map())

  assert.equal(view.platforms[0]?.active, false)
  assert.equal(view.hasDeactivatedIssuer, true)
})

test('survives a missing worker row', () => {
  const view = toProfileView(null, ratings, new Map([[1, true], [2, true], [3, true]]))

  assert.equal(view.displayName, null)
  assert.equal(view.headline, null)
  assert.equal(view.cachedAt, null)
  assert.equal(view.ratings.length, 10)
})

test('accepts the embedded platform arriving as an array', () => {
  // supabase-js types a foreign-table embed as an array in some versions; the
  // mapper accepts both shapes rather than betting on one.
  const row: RatingRow = { ...rating(0, 5, 1), platforms: [{ name: 'Platform 1' }] }
  const view = toProfileView(worker, [row], new Map([[1, true]]))

  assert.equal(view.ratings[0]?.platformName, 'Platform 1')
})
