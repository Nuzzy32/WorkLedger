import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { topUpAmount } from '../lib/drip.ts'

test('a wallet short of the cost gets exactly the difference', () => {
  assert.equal(topUpAmount(0n, 1000n), 1000n)
  assert.equal(topUpAmount(400n, 1000n), 600n)
})

test('a wallet already holding the cost gets nothing', () => {
  assert.equal(topUpAmount(1000n, 1000n), 0n)
  assert.equal(topUpAmount(5000n, 1000n), 0n)
})
