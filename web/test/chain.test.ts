import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { deploymentPath, explorerAddressUrl, explorerTxUrl, parseDeployment } from '../lib/chain.ts'

test('parses the deployment file the deploy script writes', () => {
  // Inline, not read from contracts/deployments/anvil.json: that file is
  // gitignored and does not exist in this worktree. Shape matches the deploy
  // script's real output exactly, using anvil's deterministic addresses.
  const raw: unknown = {
    chainId: 31337,
    block: 0,
    platformRegistry: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    ratingRegistry: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    workerRegistry: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
  }
  const deployment = parseDeployment(raw)

  assert.equal(deployment.chainId, 31337)
  assert.equal(deployment.workerRegistry.startsWith('0x'), true)
  assert.equal(deployment.ratingRegistry.length, 42)
  assert.equal(deployment.platformRegistry.length, 42)
})

test('maps chain ids to their deployment file', () => {
  assert.equal(deploymentPath(31337, '..').endsWith('contracts/deployments/anvil.json'), true)
  assert.equal(
    deploymentPath(84532, '..').endsWith('contracts/deployments/base-sepolia.json'),
    true,
  )
  assert.throws(() => deploymentPath(1, '..'), /no deployment file for chain id 1/)
})

test('rejects a deployment missing an address', () => {
  assert.throws(
    () => parseDeployment({ chainId: 31337, block: 0, workerRegistry: '0x00' }),
    /deployment/,
  )
})

test('offers explorer links only where an explorer exists', () => {
  const address = '0xC0895fa97828c38109b25C4CBb060Bf7B05CBb5B'
  const txHash = `0x${'ab'.repeat(32)}`

  assert.equal(
    explorerAddressUrl(84532, address),
    `https://sepolia.basescan.org/address/${address}`,
  )
  assert.equal(explorerTxUrl(84532, txHash), `https://sepolia.basescan.org/tx/${txHash}`)
  assert.equal(explorerAddressUrl(31337, address), null)
  assert.equal(explorerTxUrl(31337, txHash), null)
})
