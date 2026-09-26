import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  createChainClient,
  loadDeployment,
  readScoringPrior,
  readWorkerChainState,
} from '../../lib/chain.ts'

const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545'
const UNKNOWN = '0x0000000000000000000000000000000000000001' as const

test('an unregistered address reads back as unregistered, carrying the prior score', async () => {
  const deployment = loadDeployment(31337, '..')
  const client = createChainClient(31337, RPC_URL)

  const state = await readWorkerChainState(client, deployment, UNKNOWN)

  assert.equal(state.registered, false)
  assert.equal(state.ratingCount, 0)
  // The trap this test exists for: scoreOf returns PRIOR_SCORE_BPS, not zero,
  // so the page must gate every score display on `registered`.
  assert.equal(state.scoreBps, 30000)
})

test('the scoring prior reads back as the deployed constants', async () => {
  const deployment = loadDeployment(31337, '..')
  const client = createChainClient(31337, RPC_URL)

  assert.deepEqual(await readScoringPrior(client, deployment), {
    priorScoreBps: 30000,
    priorWeight: 5,
  })
})
