import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { normalizeAddress } from '../lib/address.ts'
import { DEMO_PROFILES } from '../lib/demo.ts'

test('offers exactly two demo profiles, one established and one new', () => {
  assert.equal(DEMO_PROFILES.length, 2)
  assert.deepEqual(DEMO_PROFILES.map((profile) => profile.kind), ['established', 'new'])
})

test('every demo address passes the checksum the profile route enforces', () => {
  // A hand-typed address with one wrong capital looks right and renders the
  // not-found page. The route rejects bad checksums on purpose, so the home
  // page's own links must survive the same check.
  for (const profile of DEMO_PROFILES) {
    const normalized = normalizeAddress(profile.address)
    assert.notEqual(normalized, null, `${profile.name} has an invalid address`)
    assert.equal(normalized?.display, profile.address, `${profile.name} is not in checksummed form`)
  }
})

test('the two demo profiles are different workers', () => {
  const [first, second] = DEMO_PROFILES
  assert.notEqual(first?.address.toLowerCase(), second?.address.toLowerCase())
})
