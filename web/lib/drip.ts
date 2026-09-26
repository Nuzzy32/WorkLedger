import type { Account, Address, Chain, Hash, PublicClient, Transport, WalletClient } from 'viem'
import { workerRegistryAbi, type Deployment } from './chain.ts'

/**
 * How many times the estimated cost the drip sends. The browser signs with its
 * own fee estimate a few seconds later, and a fee that rose in between would
 * leave the worker stuck one wei short.
 */
export const FEE_HEADROOM = 3n

export type DripResult =
  | { status: 'registered' }
  | { status: 'not-eligible' }
  | { status: 'enough' }
  | { status: 'funded'; txHash: Hash }

/** What to send so the wallet holds at least `cost`. Never negative. */
export function topUpAmount(balance: bigint, cost: bigint): bigint {
  return balance >= cost ? 0n : cost - balance
}

/**
 * Fund a new worker's wallet for exactly one `register()` call.
 *
 * The limit is enforced by the chain, not by a table: a wallet qualifies only
 * while it has never sent a transaction. Registering is that first
 * transaction, and so is moving the drip elsewhere, so either one ends the
 * wallet's eligibility for good.
 *
 * ponytail: two requests racing on separate server instances can both see a
 * fresh wallet and both pay. The loss is testnet dust; a row per wallet in
 * Postgres closes it if it ever matters.
 */
export async function dripForRegistration(
  client: PublicClient,
  faucet: WalletClient<Transport, Chain, Account>,
  deployment: Deployment,
  worker: Address,
): Promise<DripResult> {
  const [registered, sent] = await Promise.all([
    client.readContract({
      address: deployment.workerRegistry,
      abi: workerRegistryAbi,
      functionName: 'isRegistered',
      args: [worker],
    }),
    client.getTransactionCount({ address: worker }),
  ])
  if (registered) return { status: 'registered' }
  if (sent > 0) return { status: 'not-eligible' }

  const [gas, fees, balance] = await Promise.all([
    client.estimateContractGas({
      address: deployment.workerRegistry,
      abi: workerRegistryAbi,
      functionName: 'register',
      account: worker,
    }),
    client.estimateFeesPerGas(),
    client.getBalance({ address: worker }),
  ])

  const amount = topUpAmount(balance, gas * fees.maxFeePerGas * FEE_HEADROOM)
  if (amount === 0n) return { status: 'enough' }

  const txHash = await faucet.sendTransaction({ to: worker, value: amount })
  const receipt = await client.waitForTransactionReceipt({ hash: txHash })
  if (receipt.status !== 'success') throw new Error(`drip ${txHash} reverted`)

  return { status: 'funded', txHash }
}
