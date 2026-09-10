import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveAccounts } from '../src/accounts.ts'
import { buildPlan } from '../src/plan.ts'
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

// Carried from test 1 to test 2: without it, both tests pass on an
// already-seeded chain (0 submitted + 600 skipped, then 0 submitted) and the
// suite never proves a submission happened in this run.
let firstSubmitted = -1

function ctx(): ChainCtx {
  const accounts = deriveAccounts(MNEMONIC)
  const addresses = loadDeployment(31337)
  const { publicClient, walletClientFor } = makeClients(config)
  return { config, accounts, addresses, publicClient, walletClientFor }
}

test('submits all 600 ratings and every score matches the plan', async () => {
  const c = ctx()
  const plan = buildPlan(config.seedTag)

  await ensurePlatforms(c, plan)
  await ensureFunded(c, c.accounts)
  await ensureWorkersRegistered(c, c.accounts)

  const result = await submitRatings(c, plan)
  firstSubmitted = result.submitted
  assert.equal(result.submitted + result.skipped, 600)
  assert.equal(result.txHashes.size, 600, 'every jobId needs a tx hash for the Postgres row')

  const { checked, mismatches } = await verifyScores(c, plan)
  assert.equal(checked, c.accounts.workers.length, 'every worker must actually be compared')
  assert.deepEqual(mismatches, [], 'on-chain scores must equal the plan-derived scores')
})

test('re-running submits nothing: the chain is the checkpoint', async () => {
  const c = ctx()
  const plan = buildPlan(config.seedTag)
  await ensurePlatforms(c, plan)

  const again = await submitRatings(c, plan)
  assert.equal(again.submitted, 0, 'ratingOf(jobId) must gate resubmission')
  assert.equal(again.skipped, 600)
  assert.equal(
    firstSubmitted + again.submitted,
    600,
    'the two passes together must account for all 600 submissions — if this ' +
      'fails at 0, the chain was already seeded and neither pass proved anything',
  )
})
