import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { countByScore, formatScore, selectState, type ProfileSignals } from '../lib/score.ts'

test('formats basis points by rounding to the nearest cent', () => {
  assert.equal(formatScore(43200), '4.32')
  assert.equal(formatScore(43299), '4.33') // rounds up to the nearest cent, matching bpsToDecimal
  assert.equal(formatScore(30000), '3.00')
  assert.equal(formatScore(50000), '5.00')
  assert.equal(formatScore(40500), '4.05')
  assert.equal(formatScore(44250), '4.43') // exact half: docs/DECISIONS.md K, naive toFixed would give 4.42
})

test('counts a rating set into five buckets', () => {
  assert.deepEqual(countByScore([5, 5, 4, 1, 5]), [1, 0, 0, 1, 3])
  assert.deepEqual(countByScore([]), [0, 0, 0, 0, 0])
})

test('rejects a score outside the range the contract enforces', () => {
  assert.throws(() => countByScore([0]), /score out of range/)
  assert.throws(() => countByScore([6]), /score out of range/)
  assert.throws(() => countByScore([4.5]), /score out of range/)
})

const healthy: ProfileSignals = {
  addressValid: true,
  chainRead: 'ok',
  registered: true,
  hasWorkerRow: true,
  ratingCount: 40,
  hasDeactivatedIssuer: false,
}

test('an invalid address is not found, before any read', () => {
  assert.deepEqual(selectState({ ...healthy, addressValid: false }), {
    state: 'not-found',
    neutralRing: false,
  })
})

test('an unregistered address with no row is not found', () => {
  assert.deepEqual(
    selectState({ ...healthy, registered: false, hasWorkerRow: false, ratingCount: 0 }),
    { state: 'not-found', neutralRing: false },
  )
})

test('no ratings yet is empty, not unproven', () => {
  assert.deepEqual(selectState({ ...healthy, ratingCount: 0 }), {
    state: 'empty',
    neutralRing: false,
  })
})

test('under the threshold is unproven', () => {
  assert.deepEqual(selectState({ ...healthy, ratingCount: 9 }), {
    state: 'unproven',
    neutralRing: false,
  })
})

test('at the threshold is verified', () => {
  assert.deepEqual(selectState({ ...healthy, ratingCount: 10 }), {
    state: 'verified',
    neutralRing: false,
  })
})

test('a failed chain read falls back to the cached row as partial', () => {
  assert.deepEqual(selectState({ ...healthy, chainRead: 'failed' }), {
    state: 'partial',
    neutralRing: false,
  })
})

test('a failed chain read with no cached row is not found', () => {
  assert.deepEqual(selectState({ ...healthy, chainRead: 'failed', hasWorkerRow: false }), {
    state: 'not-found',
    neutralRing: false,
  })
})

test('a deactivated issuer neutralises the ring without changing the state', () => {
  assert.deepEqual(selectState({ ...healthy, hasDeactivatedIssuer: true }), {
    state: 'verified',
    neutralRing: true,
  })
  assert.deepEqual(selectState({ ...healthy, ratingCount: 3, hasDeactivatedIssuer: true }), {
    state: 'unproven',
    neutralRing: true,
  })
})

test('a failed database read still reports the chain state', () => {
  // A database outage arrives as a missing worker row. The score is the
  // chain's answer, so it must survive one.
  assert.deepEqual(selectState({ ...healthy, hasWorkerRow: false }), {
    state: 'verified',
    neutralRing: false,
  })
})
