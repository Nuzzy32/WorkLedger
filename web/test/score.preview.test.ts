import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { previewScoreBps, ratingsToVerified } from '../lib/score.ts'

test('the preview matches the contract for the documented cases', () => {
  // docs/CONTRACTS.md: one 5-star rating gives (5 + 15) / 6 = 3.33.
  assert.equal(previewScoreBps(1, 5, 30_000, 5), 33_333)
  // A fresh account is the prior itself.
  assert.equal(previewScoreBps(0, 0, 30_000, 5), 30_000)
  // docs/DECISIONS.md entry I: 50 ratings averaging 2 stars.
  assert.equal(previewScoreBps(50, 100, 30_000, 5), 20_909)
})

test('ratings to verified counts down and stops at zero', () => {
  assert.equal(ratingsToVerified(0), 10)
  assert.equal(ratingsToVerified(7), 3)
  assert.equal(ratingsToVerified(10), 0)
  assert.equal(ratingsToVerified(40), 0)
})
