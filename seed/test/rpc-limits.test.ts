import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeEventTopics, getAddress, type Address, type Log } from 'viem'
import { LOG_BLOCK_RANGE, logBlockWindows, platformIdFromLogs } from '../src/chain.ts'
import { PLATFORM_REGISTERED_EVENT } from '../src/abi.ts'

test('splits a long range into windows the public rpc accepts', () => {
  assert.deepEqual(logBlockWindows(100n, 2599n, 1000n), [
    { fromBlock: 100n, toBlock: 1099n },
    { fromBlock: 1100n, toBlock: 2099n },
    { fromBlock: 2100n, toBlock: 2599n },
  ])
})

test('a range of exactly one window is one request', () => {
  assert.deepEqual(logBlockWindows(0n, 999n, 1000n), [{ fromBlock: 0n, toBlock: 999n }])
})

test('a single block is one window', () => {
  assert.deepEqual(logBlockWindows(5n, 5n, 1000n), [{ fromBlock: 5n, toBlock: 5n }])
})

test('an empty range asks for nothing', () => {
  assert.deepEqual(logBlockWindows(10n, 9n, 1000n), [])
})

test('default windows never exceed the cap and cover every block exactly once', () => {
  // Base Sepolia's public RPC rejects eth_getLogs over more than 1,000 blocks.
  // The first public seed run found this: 1,170 blocks after the deploy, one
  // unbounded query came back "eth_getLogs is limited to a 1,000 range".
  assert.equal(LOG_BLOCK_RANGE, 1000n)
  const from = 47_195_022n
  const to = from + 5_432n
  const windows = logBlockWindows(from, to)
  let next = from
  for (const w of windows) {
    assert.equal(w.fromBlock, next, 'windows must be contiguous')
    assert.ok(w.toBlock - w.fromBlock + 1n <= LOG_BLOCK_RANGE, 'a window exceeds the rpc cap')
    next = w.toBlock + 1n
  }
  assert.equal(next, to + 1n, 'windows must end exactly at the last block')
})

// getAddress checksums lowercase hex, so the fixtures are valid addresses
// rather than hand-typed mixed case that only looks like one.
const SIGNER: Address = getAddress('0xabbd9267a8a1f5c2b39f0d3e2f16c0b6f9bd9a01')
const OTHER: Address = getAddress('0xd7efb0cc2a3f4e5d6c7b8a9f0e1d2c3b4a5f6e7d')

function registrationLog(platformId: number, signer: Address): Log {
  return {
    address: '0x41097b03Dd6aCE30f69363D28e5e0BcF1ce91Db6',
    topics: encodeEventTopics({
      abi: [PLATFORM_REGISTERED_EVENT],
      eventName: 'PlatformRegistered',
      args: { platformId, signer },
    }) as Log['topics'],
    data: '0x',
    blockHash: `0x${'11'.repeat(32)}`,
    blockNumber: 47_195_030n,
    logIndex: 0,
    transactionHash: `0x${'22'.repeat(32)}`,
    transactionIndex: 0,
    removed: false,
  }
}

test('reads the assigned platform id from the registration receipt', () => {
  assert.equal(platformIdFromLogs([registrationLog(2, SIGNER)], SIGNER), 2)
})

test('matches the signer regardless of address case', () => {
  assert.equal(platformIdFromLogs([registrationLog(3, SIGNER)], SIGNER.toLowerCase() as Address), 3)
})

test('ignores a registration event for a different signer', () => {
  assert.throws(() => platformIdFromLogs([registrationLog(1, OTHER)], SIGNER), /PlatformRegistered/)
})

test('refuses to guess when the receipt carries no registration event', () => {
  // The whole point: never fall back to a follow-up read, which a lagging
  // load-balanced node can answer with 0.
  assert.throws(() => platformIdFromLogs([], SIGNER), /PlatformRegistered/)
})
