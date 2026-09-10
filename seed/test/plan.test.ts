import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPlan, expectedScoreBps } from '../src/plan.ts'
import { deriveAccounts } from '../src/accounts.ts'

const TAG = 'workledger-demo-v1'
const MNEMONIC = 'test test test test test test test test test test test junk'

test('produces exactly 3 platforms and 600 ratings', () => {
  const plan = buildPlan(TAG)
  assert.equal(plan.platforms.length, 3)
  assert.equal(plan.ratings.length, 600)
})

test('is deterministic for a given seed tag', () => {
  assert.deepEqual(buildPlan(TAG), buildPlan(TAG))
})

test('a different seed tag produces different jobIds', () => {
  const a = buildPlan(TAG)
  const b = buildPlan('other-tag')
  assert.notEqual(a.ratings[0]!.jobId, b.ratings[0]!.jobId)
})

test('every jobId is unique, since jobId is the storage key', () => {
  const ids = buildPlan(TAG).ratings.map((r) => r.jobId)
  assert.equal(new Set(ids).size, 600, 'a duplicate jobId would revert JobAlreadyRated')
})

test('every score is within the 1..5 the contract accepts', () => {
  for (const r of buildPlan(TAG).ratings) {
    assert.ok(r.score >= 1 && r.score <= 5, `score ${r.score} would revert InvalidScore`)
  }
})

test('scores are weighted toward 4 and 5', () => {
  const ratings = buildPlan(TAG).ratings
  const high = ratings.filter((r) => r.score >= 4).length
  assert.ok(high / ratings.length > 0.6, `expected a majority of 4s and 5s, got ${high}/600`)
})

test('all 40 workers receive at least one rating', () => {
  const seen = new Set(buildPlan(TAG).ratings.map((r) => r.workerIndex))
  assert.equal(seen.size, 40)
})

test('no rating resolves to the same on-chain address for worker and client', () => {
  const accounts = deriveAccounts(MNEMONIC)
  for (const r of buildPlan(TAG).ratings) {
    const worker = accounts.workers[r.workerIndex]
    const client = accounts.clients[r.clientIndex]
    assert.ok(worker, `workerIndex ${r.workerIndex} is out of range`)
    assert.ok(client, `clientIndex ${r.clientIndex} is out of range`)
    assert.notEqual(
      worker.address,
      client.address,
      `rating ${r.index}: worker and client derive to the same address, submitRating would revert SelfRatingForbidden()`,
    )
  }
})

test('exactly one worker has only 2 ratings, for the unproven state', () => {
  const counts = new Map<number, number>()
  for (const r of buildPlan(TAG).ratings) {
    counts.set(r.workerIndex, (counts.get(r.workerIndex) ?? 0) + 1)
  }
  const withTwo = [...counts.values()].filter((n) => n === 2)
  assert.equal(withTwo.length, 1, 'docs/DATA-MODEL.md asks for one barely-rated worker')
})

test('two workers have mixed histories spanning low and high scores', () => {
  const byWorker = new Map<number, number[]>()
  for (const r of buildPlan(TAG).ratings) {
    byWorker.set(r.workerIndex, [...(byWorker.get(r.workerIndex) ?? []), r.score])
  }
  const mixed = [...byWorker.values()].filter(
    (s) => s.length >= 10 && s.some((x) => x <= 2) && s.some((x) => x >= 5),
  )
  assert.ok(mixed.length >= 2, 'docs/DATA-MODEL.md asks for two deliberately mixed histories')
})

test('ratings are spread across all three platforms', () => {
  const seen = new Set(buildPlan(TAG).ratings.map((r) => r.platformIndex))
  assert.deepEqual([...seen].sort(), [0, 1, 2])
})

test('expectedScoreBps reproduces the contract formula', () => {
  // (scoreSum * 10000 + 5 * 30000) / (count + 5), integer division
  const fake = [
    { workerIndex: 7, score: 5 },
    { workerIndex: 7, score: 5 },
    { workerIndex: 7, score: 4 },
  ]
  // sum 14, count 3 -> (140000 + 150000) / 8 = 36250
  assert.equal(expectedScoreBps(fake, 7), 36_250)
})

test('a worker with no ratings scores the bare prior', () => {
  assert.equal(expectedScoreBps([], 0), 30_000)
})

test('the sparse worker scores above the bare prior but well below a proven profile', () => {
  const plan = buildPlan(TAG)
  const counts = new Map<number, number>()
  for (const r of plan.ratings) counts.set(r.workerIndex, (counts.get(r.workerIndex) ?? 0) + 1)

  const sparse = [...counts.entries()].find(([, n]) => n === 2)
  assert.ok(sparse, 'the plan must contain a 2-rating worker')

  const expected = expectedScoreBps(plan.ratings, sparse[0])
  assert.ok(expected > 30_000, 'two decent ratings should sit just above the bare prior')
  assert.ok(expected < 45_000, 'and well below a proven profile')
})
