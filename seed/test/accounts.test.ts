import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveAccounts, ACCOUNT_INDICES } from '../src/accounts.ts'

const MNEMONIC = 'test test test test test test test test test test test junk'

test('derives the documented number of accounts in each role', () => {
  const a = deriveAccounts(MNEMONIC)
  assert.equal(a.platforms.length, 3)
  assert.equal(a.clients.length, 20)
  assert.equal(a.workers.length, 40)
  assert.equal(1 + a.platforms.length + a.clients.length + a.workers.length, 64)
})

test('is deterministic: the same mnemonic yields the same addresses', () => {
  const first = deriveAccounts(MNEMONIC)
  const second = deriveAccounts(MNEMONIC)
  assert.equal(first.deployer.address, second.deployer.address)
  assert.deepEqual(
    first.workers.map((w) => w.address),
    second.workers.map((w) => w.address),
  )
})

test('every address is unique across all roles', () => {
  const a = deriveAccounts(MNEMONIC)
  const all = [a.deployer, ...a.platforms, ...a.clients, ...a.workers].map((x) => x.address)
  assert.equal(new Set(all).size, 64, 'a reused address would corrupt the seed')
})

test('no worker is also a client, which submitRating forbids', () => {
  const a = deriveAccounts(MNEMONIC)
  const workers = new Set(a.workers.map((w) => w.address))
  for (const c of a.clients) {
    assert.ok(!workers.has(c.address), 'att.worker == att.client reverts SelfRatingForbidden')
  }
})

test('index ranges match the documented layout', () => {
  assert.equal(ACCOUNT_INDICES.deployer, 0)
  assert.deepEqual(ACCOUNT_INDICES.platforms, [1, 2, 3])
  assert.equal(ACCOUNT_INDICES.clients[0], 10)
  assert.equal(ACCOUNT_INDICES.clients.at(-1), 29)
  assert.equal(ACCOUNT_INDICES.workers[0], 100)
  assert.equal(ACCOUNT_INDICES.workers.at(-1), 139)
})
