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

test('registers the three platforms and returns their ids in order', async () => {
  const c = ctx()
  const plan = buildPlan(config.seedTag)
  const ids = await ensurePlatforms(c, plan)

  assert.equal(ids.length, 3)
  assert.deepEqual(ids, [...ids].sort((x, y) => x - y), 'ids should be ascending')
  for (const id of ids) assert.ok(id > 0, 'id 0 means unknown')
})

test('platform registration is idempotent: a second call registers nothing new', async () => {
  const c = ctx()
  const plan = buildPlan(config.seedTag)
  const first = await ensurePlatforms(c, plan)
  const second = await ensurePlatforms(c, plan)
  assert.deepEqual(second, first, 'same ids, no duplicates created')
})

test('funds every worker and client, then reports zero on a second pass', async () => {
  const c = ctx()
  const funded = await ensureFunded(c, c.accounts)
  assert.ok(funded >= 0)

  const again = await ensureFunded(c, c.accounts)
  assert.equal(again, 0, 'already-funded addresses must be skipped')
})

test('registers all 40 workers, then reports zero on a second pass', async () => {
  const c = ctx()
  await ensureFunded(c, c.accounts)
  const registered = await ensureWorkersRegistered(c, c.accounts)
  assert.ok(registered <= 40)

  const again = await ensureWorkersRegistered(c, c.accounts)
  assert.equal(again, 0, 'isRegistered must gate re-registration')

  for (const w of c.accounts.workers) {
    const isReg = await c.publicClient.readContract({
      address: c.addresses.workerRegistry,
      abi: (await import('../src/abi.ts')).WORKER_REGISTRY_ABI,
      functionName: 'isRegistered',
      args: [w.address],
    })
    assert.equal(isReg, true, `${w.address} should be registered`)
  }
})
