import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { normalizeAddress } from '../lib/address.ts'

const LOWER = '0xc0895fa97828c38109b25c4cbb060bf7b05cbb5b'
const CHECKSUMMED = '0xC0895fa97828c38109b25C4CBb060Bf7B05CBb5B'

test('accepts a lowercase address and keeps both forms', () => {
  const result = normalizeAddress(LOWER)
  assert.notEqual(result, null)
  assert.equal(result?.queryKey, LOWER)
  assert.equal(result?.display, CHECKSUMMED)
})

test('accepts a checksummed address and lowercases the query key', () => {
  const result = normalizeAddress(CHECKSUMMED)
  assert.equal(result?.queryKey, LOWER)
  assert.equal(result?.display, CHECKSUMMED)
})

test('rejects an address whose checksum does not hold', () => {
  // Same hex, one character's case flipped: a mistyped or mangled link.
  const mangled = '0xc0895FA97828c38109b25C4CBb060Bf7B05CBb5B'
  assert.equal(normalizeAddress(mangled), null)
})

test('rejects malformed input', () => {
  for (const raw of ['', '0x', 'not-an-address', LOWER.slice(0, -1), LOWER.slice(2)]) {
    assert.equal(normalizeAddress(raw), null, `expected null for ${JSON.stringify(raw)}`)
  }
})
