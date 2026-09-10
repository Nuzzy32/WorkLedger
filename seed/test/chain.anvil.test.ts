import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveAccounts } from '../src/accounts.ts'
import { buildPlan } from '../src/plan.ts'
import { PLATFORM_REGISTRY_ABI, WORKER_REGISTRY_ABI } from '../src/abi.ts'
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

const FRESH_CHAIN_HELP =
  'This suite only proves anything on a chain with no prior seed state: ' +
  'the whole point is watching counts go from nonzero to zero. Restart anvil, ' +
  'delete contracts/deployments/anvil.json, and redeploy before rerunning ' +
  '(see task-5-brief.md Step 5).'

/**
 * Preconditions the rest of the suite leans on: nobody has registered a
 * platform or a worker yet. Skipping this lets every assertion below pass
 * vacuously against a chain left over from a previous run.
 */
async function assertFreshChain(c: ChainCtx): Promise<void> {
  for (const platform of c.accounts.platforms) {
    const id = await c.publicClient.readContract({
      address: c.addresses.platformRegistry,
      abi: PLATFORM_REGISTRY_ABI,
      functionName: 'platformIdOf',
      args: [platform.address],
    })
    assert.equal(id, 0, `platform signer ${platform.address} is already registered (id ${id}). ${FRESH_CHAIN_HELP}`)
  }

  for (const worker of c.accounts.workers) {
    const isReg = await c.publicClient.readContract({
      address: c.addresses.workerRegistry,
      abi: WORKER_REGISTRY_ABI,
      functionName: 'isRegistered',
      args: [worker.address],
    })
    assert.equal(isReg, false, `worker ${worker.address} is already registered. ${FRESH_CHAIN_HELP}`)
  }
}

test('registers the three platforms and returns their ids in order', async () => {
  const c = ctx()
  await assertFreshChain(c)

  const plan = buildPlan(config.seedTag)
  const ids = await ensurePlatforms(c, plan)

  assert.equal(ids.length, 3)
  assert.deepEqual(ids, [...ids].sort((x, y) => x - y), 'ids should be ascending')
  for (const id of ids) assert.ok(id > 0, 'id 0 means unknown')
  assert.deepEqual(
    ids,
    [1, 2, 3],
    'a fresh PlatformRegistry assigns ids starting at 1; anything else means the chain was not fresh or registration order changed',
  )
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
  assert.equal(
    funded,
    60,
    '40 workers + 20 clients should all need topping up on a chain none of them has touched yet; ' +
      `a different count means some were already funded. ${FRESH_CHAIN_HELP}`,
  )

  const again = await ensureFunded(c, c.accounts)
  assert.equal(again, 0, 'already-funded addresses must be skipped')
})

test('registers all 40 workers, then reports zero on a second pass', async () => {
  const c = ctx()
  await ensureFunded(c, c.accounts)
  const registered = await ensureWorkersRegistered(c, c.accounts)
  assert.equal(
    registered,
    40,
    `all 40 workers should be newly registered on a fresh chain. ${FRESH_CHAIN_HELP}`,
  )

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
