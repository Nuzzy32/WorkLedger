import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPlan, expectedScoreBps } from '../src/plan.ts'

const TAG = 'workledger-demo-v1'

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

test('no rating has the same worker and client, which the contract forbids', () => {
  for (const r of buildPlan(TAG).ratings) {
    assert.notEqual(r.workerIndex, r.clientIndex, 'SelfRatingForbidden')
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
