import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveAccounts } from '../src/accounts.ts'
import { buildPlan, expectedScoreBps } from '../src/plan.ts'
import {
  loadDeployment,
  makeClients,
  ensurePlatforms,
  ensureFunded,
  ensureWorkersRegistered,
  submitRatings,
  verifyScores,
  type ChainCtx,
} from '../src/chain.ts'

const MNEMONIC = 'test test test test test test test test test test test junk'
const config = {
  rpcUrl: 'http://127.0.0.1:8545',
  chainId: 31337,
  mnemonic: MNEMONIC,
  seedTag: 'workledger-demo-v1',
}

function ctx(): ChainCtx {
  const accounts = deriveAccounts(MNEMONIC)
  const addresses = loadDeployment(31337)
  const { publicClient, walletClientFor } = makeClients(config)
  return { config, accounts, addresses, publicClient, walletClientFor }
}

test('submits all 600 ratings and every score matches the plan', async () => {
  const c = ctx()
  const plan = buildPlan(config.seedTag)

  const platformIds = await ensurePlatforms(c, plan)
  await ensureFunded(c, c.accounts)
  await ensureWorkersRegistered(c, c.accounts)

  const result = await submitRatings(c, plan, platformIds)
  assert.equal(result.submitted + result.skipped, 600)
  assert.equal(result.txHashes.size, 600, 'every jobId needs a tx hash for the Postgres row')

  const mismatches = await verifyScores(c, plan)
  assert.deepEqual(mismatches, [], 'on-chain scores must equal the plan-derived scores')
})

test('re-running submits nothing: the chain is the checkpoint', async () => {
  const c = ctx()
  const plan = buildPlan(config.seedTag)
  const platformIds = await ensurePlatforms(c, plan)

  const again = await submitRatings(c, plan, platformIds)
  assert.equal(again.submitted, 0, 'ratingOf(jobId) must gate resubmission')
  assert.equal(again.skipped, 600)
})

test('the sparse worker sits below the unproven threshold of 10', async () => {
  const c = ctx()
  const plan = buildPlan(config.seedTag)
  const counts = new Map<number, number>()
  for (const r of plan.ratings) counts.set(r.workerIndex, (counts.get(r.workerIndex) ?? 0) + 1)

  const sparse = [...counts.entries()].find(([, n]) => n === 2)
  assert.ok(sparse, 'the plan must contain a 2-rating worker')

  const expected = expectedScoreBps(plan.ratings, sparse[0])
  assert.ok(expected > 30_000, 'two decent ratings should sit just above the bare prior')
  assert.ok(expected < 45_000, 'and well below a proven profile')
})
