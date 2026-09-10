import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toRatingRow, toWorkerRow, toPlatformRow, bpsToDecimal } from '../src/db.ts'
import { buildPlan } from '../src/plan.ts'

const CHECKSUMMED = '0xAbC0000000000000000000000000000000000001' as const
const CLIENT = '0xDdD0000000000000000000000000000000000002' as const
const TX = '0xFEED000000000000000000000000000000000000000000000000000000000003' as const

test('bpsToDecimal converts basis points to a 2-decimal string', () => {
  assert.equal(bpsToDecimal(30_000), '3.00')
  assert.equal(bpsToDecimal(43_333), '4.33')
  assert.equal(bpsToDecimal(50_000), '5.00')
  assert.equal(bpsToDecimal(20_909), '2.09')
})

test('bpsToDecimal rounds exact halfway values up, not down', () => {
  // Float division puts these one unit below the true value, so toFixed(2)
  // would round them down. Integer arithmetic must not.
  assert.equal(bpsToDecimal(44_250), '4.43')
  assert.equal(bpsToDecimal(10_050), '1.01')
  assert.equal(bpsToDecimal(43_350), '4.34')
  assert.equal(bpsToDecimal(12_750), '1.28')
})

test('worker addresses are stored lowercase', () => {
  const row = toWorkerRow(CHECKSUMMED, 'Sari W.', 'Courier, 4 years', 43_333, 30)
  assert.equal(row.address, CHECKSUMMED.toLowerCase())
  assert.notEqual(row.address, CHECKSUMMED, 'a checksummed address would create a second row')
})

test('rating rows lowercase both the worker and the client', () => {
  // buildPlan always produces 600 ratings, so index 0 is in bounds;
  // noUncheckedIndexedAccess still widens the type to include undefined.
  const rating = buildPlan('t').ratings[0]!
  const row = toRatingRow(rating, {
    workerAddress: CHECKSUMMED,
    clientAddress: CLIENT,
    platformId: 1,
    txHash: TX,
    submittedAt: new Date(0),
  })
  assert.equal(row.worker, CHECKSUMMED.toLowerCase())
  assert.equal(row.client, CLIENT.toLowerCase())
})

test('a rating row without a confirmed tx hash is refused', () => {
  // buildPlan always produces 600 ratings, so index 0 is in bounds;
  // noUncheckedIndexedAccess still widens the type to include undefined.
  const rating = buildPlan('t').ratings[0]!
  assert.throws(
    () =>
      toRatingRow(rating, {
        workerAddress: CHECKSUMMED,
        clientAddress: CLIENT,
        platformId: 1,
        txHash: undefined,
        submittedAt: new Date(0),
      }),
    /tx_hash/,
    'docs/DATA-MODEL.md: a row with no tx_hash is a rating that does not exist',
  )
})

test('the job id and score carry through unchanged', () => {
  // buildPlan always produces 600 ratings, so index 5 is in bounds;
  // noUncheckedIndexedAccess still widens the type to include undefined.
  const rating = buildPlan('t').ratings[5]!
  const row = toRatingRow(rating, {
    workerAddress: CHECKSUMMED,
    clientAddress: CLIENT,
    platformId: 2,
    txHash: TX,
    submittedAt: new Date(0),
  })
  assert.equal(row.job_id, rating.jobId)
  assert.equal(row.score, rating.score)
  assert.equal(row.platform_id, 2)
  assert.equal(row.tx_hash, TX)
})

test('platform rows keep the on-chain id as the primary key', () => {
  const row = toPlatformRow(3, 'Rampung')
  assert.equal(row.id, 3)
  assert.equal(row.name, 'Rampung')
})

test('no seeded comment or job title contains a real-looking contact detail', () => {
  const plan = buildPlan('workledger-demo-v1')
  const text = plan.ratings.map((r) => `${r.comment} ${r.jobTitle}`).join(' ')
  assert.doesNotMatch(text, /@|\+\d{6,}|https?:\/\//, 'fixtures must carry no contact data')
})
