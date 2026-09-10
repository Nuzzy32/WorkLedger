import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseEther } from 'viem'
import { fundTargetFor } from '../src/chain.ts'

test('anvil keeps one fat float for every role', () => {
  // anvil_setBalance is a free RPC call rather than a transfer, so there is
  // nothing to save locally, and anvil's default base fee opens at 1 gwei —
  // higher than Base Sepolia's typical fee.
  assert.equal(fundTargetFor(31337, 'worker'), parseEther('0.05'))
  assert.equal(fundTargetFor(31337, 'client'), parseEther('0.05'))
})

test('off anvil a worker gets far less than a client', () => {
  // A worker sends exactly one register() at roughly 100k gas. The busiest
  // client sends about 45 submitRating transactions at roughly 200k gas each,
  // so it does on the order of 45x the work and needs a float to match.
  assert.equal(fundTargetFor(84532, 'client'), parseEther('0.002'))
  assert.equal(fundTargetFor(84532, 'worker'), parseEther('0.0005'))
})

test('a worker float still clears its one transaction with room to spare', () => {
  // 100k gas at a hostile 0.1 gwei is 0.00001 ETH; Base Sepolia's base fee
  // normally sits between 0.001 and 0.01 gwei.
  const worstCaseWorkerCost = parseEther('0.00001')
  assert.ok(
    fundTargetFor(84532, 'worker') >= worstCaseWorkerCost * 20n,
    'a worker needs at least a 20x cushion over its worst-case single transaction',
  )
})

test('a client float still clears its whole rating batch', () => {
  // 45 ratings at ~200k gas is 9M gas; at a hostile 0.1 gwei that is 0.0009 ETH.
  const worstCaseClientCost = parseEther('0.0009')
  assert.ok(
    fundTargetFor(84532, 'client') >= worstCaseClientCost * 2n,
    'the busiest client needs at least a 2x cushion over its worst-case batch',
  )
})

test('the whole account set fits inside a single faucet grant', () => {
  // 20 clients at derivation indices 10-29, 40 workers at 100-139.
  const total = 20n * fundTargetFor(84532, 'client') + 40n * fundTargetFor(84532, 'worker')
  assert.equal(total, parseEther('0.06'))
  assert.ok(
    total < parseEther('0.1'),
    'Base Sepolia faucets dispense 0.05-0.1 ETH per day, so the set must fit one grant',
  )
})
