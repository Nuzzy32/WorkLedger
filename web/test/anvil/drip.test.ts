import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createWalletClient, http } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { anvil } from 'viem/chains'
import { createChainClient, loadDeployment, workerRegistryAbi } from '../../lib/chain.ts'
import { dripForRegistration } from '../../lib/drip.ts'

const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545'
// anvil's well-known first account. Worthless off a local chain.
const FAUCET_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

const deployment = loadDeployment(31337, '..')
const client = createChainClient(31337, RPC_URL)
const faucet = createWalletClient({
  account: privateKeyToAccount(FAUCET_KEY),
  chain: anvil,
  transport: http(RPC_URL),
})

test('a fresh wallet is funded for exactly one registration, and then never again', async () => {
  const worker = privateKeyToAccount(generatePrivateKey())

  const first = await dripForRegistration(client, faucet, deployment, worker.address)
  assert.equal(first.status, 'funded')

  // The drip alone must be enough to register: nothing else funds this wallet.
  const wallet = createWalletClient({ account: worker, chain: anvil, transport: http(RPC_URL) })
  const hash = await wallet.writeContract({
    address: deployment.workerRegistry,
    abi: workerRegistryAbi,
    functionName: 'register',
  })
  const receipt = await client.waitForTransactionReceipt({ hash })
  assert.equal(receipt.status, 'success')

  const again = await dripForRegistration(client, faucet, deployment, worker.address)
  assert.equal(again.status, 'registered')
})

test('a wallet that already sent a transaction is not eligible', async () => {
  const worker = privateKeyToAccount(generatePrivateKey())
  await dripForRegistration(client, faucet, deployment, worker.address)

  // Spend the drip on something other than registering.
  const wallet = createWalletClient({ account: worker, chain: anvil, transport: http(RPC_URL) })
  const hash = await wallet.sendTransaction({ to: faucet.account.address, value: 1n })
  await client.waitForTransactionReceipt({ hash })

  const result = await dripForRegistration(client, faucet, deployment, worker.address)
  assert.equal(result.status, 'not-eligible')
})

test('a wallet that already holds enough is not topped up', async () => {
  const worker = privateKeyToAccount(generatePrivateKey())
  const hash = await faucet.sendTransaction({ to: worker.address, value: 10n ** 18n })
  await client.waitForTransactionReceipt({ hash })

  const result = await dripForRegistration(client, faucet, deployment, worker.address)
  assert.equal(result.status, 'enough')
})
