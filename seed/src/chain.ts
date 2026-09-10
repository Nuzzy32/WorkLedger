import { readFileSync } from 'node:fs'
import {
  createPublicClient,
  createWalletClient,
  createTestClient,
  http,
  parseEther,
  type Address,
  type Chain,
  type HDAccount,
  type PublicClient,
} from 'viem'
import { foundry, baseSepolia } from 'viem/chains'
import { PLATFORM_REGISTRY_ABI, WORKER_REGISTRY_ABI } from './abi.ts'
import type { Config } from './config.ts'
import type { Accounts } from './accounts.ts'
import type { SeedPlan } from './plan.ts'

const ANVIL_CHAIN_ID = 31337

/** Minimum balance an account needs before it can transact. */
const FUND_TARGET = parseEther('0.05')

export interface Deployment {
  chainId: number
  platformRegistry: Address
  workerRegistry: Address
  ratingRegistry: Address
}

export interface ChainCtx {
  config: Config
  accounts: Accounts
  addresses: Deployment
  publicClient: PublicClient
  walletClientFor: (account: HDAccount) => ReturnType<typeof createWalletClient>
}

function chainFileName(chainId: number): string {
  if (chainId === ANVIL_CHAIN_ID) return 'anvil'
  if (chainId === baseSepolia.id) return 'base-sepolia'
  return String(chainId)
}

/** Read the artifact the deploy script wrote. */
export function loadDeployment(chainId: number): Deployment {
  const url = new URL(`../../contracts/deployments/${chainFileName(chainId)}.json`, import.meta.url)
  try {
    return JSON.parse(readFileSync(url, 'utf8')) as Deployment
  } catch {
    throw new Error(
      `No deployment for chain ${chainId}. Run the deploy script first:\n` +
        `  cd contracts && forge script script/Deploy.s.sol:DeployScript --rpc-url <url> --broadcast`,
    )
  }
}

export function resolveChain(chainId: number): Chain {
  if (chainId === ANVIL_CHAIN_ID) return foundry
  if (chainId === baseSepolia.id) return baseSepolia
  throw new Error(`Unsupported chain id ${chainId}. This project targets anvil or Base Sepolia.`)
}

export function makeClients(config: Config) {
  const chain = resolveChain(config.chainId)
  const transport = http(config.rpcUrl)

  return {
    publicClient: createPublicClient({ chain, transport }),
    walletClientFor: (account: HDAccount) => createWalletClient({ account, chain, transport }),
  }
}

/**
 * Register the plan's platforms, skipping any signer already on the allowlist.
 *
 * Idempotency check: `platformIdOf(signer) != 0`. Registering twice would revert
 * `SignerAlreadyRegistered()`, so this must be checked, not attempted.
 */
export async function ensurePlatforms(ctx: ChainCtx, plan: SeedPlan): Promise<number[]> {
  const owner = ctx.walletClientFor(ctx.accounts.deployer)
  const ids: number[] = []

  for (const [i, platform] of plan.platforms.entries()) {
    // plan.platforms always has exactly 3 entries (buildPlan maps the fixed
    // 3-element PLATFORM_NAMES), and accounts.platforms always has exactly 3
    // entries (ACCOUNT_INDICES.platforms = [1, 2, 3] in accounts.ts), so index
    // i is always in bounds for both arrays.
    const signer = ctx.accounts.platforms[i]!.address

    const existing = await ctx.publicClient.readContract({
      address: ctx.addresses.platformRegistry,
      abi: PLATFORM_REGISTRY_ABI,
      functionName: 'platformIdOf',
      args: [signer],
    })

    if (existing !== 0) {
      ids.push(existing)
      continue
    }

    const hash = await owner.writeContract({
      address: ctx.addresses.platformRegistry,
      abi: PLATFORM_REGISTRY_ABI,
      functionName: 'registerPlatform',
      args: [signer, platform.nameHash],
      chain: resolveChain(ctx.config.chainId),
      account: ctx.accounts.deployer,
    })
    await ctx.publicClient.waitForTransactionReceipt({ hash })

    const assigned = await ctx.publicClient.readContract({
      address: ctx.addresses.platformRegistry,
      abi: PLATFORM_REGISTRY_ABI,
      functionName: 'platformIdOf',
      args: [signer],
    })
    ids.push(assigned)
  }

  return ids
}

/**
 * Give every worker and client enough balance to transact.
 *
 * On anvil, accounts derived from the project mnemonic start empty — anvil funds
 * only the first ten accounts of its own mnemonic, and our workers sit at
 * indices 100-139. `anvil_setBalance` avoids 60 funding transactions locally.
 *
 * @returns how many addresses were topped up
 */
export async function ensureFunded(ctx: ChainCtx, accounts: Accounts): Promise<number> {
  const needFunding = [...accounts.workers, ...accounts.clients]
  const isAnvil = ctx.config.chainId === ANVIL_CHAIN_ID
  let topped = 0

  const testClient = isAnvil
    ? createTestClient({
        mode: 'anvil',
        chain: resolveChain(ctx.config.chainId),
        transport: http(ctx.config.rpcUrl),
      })
    : undefined

  const deployer = ctx.walletClientFor(accounts.deployer)

  for (const account of needFunding) {
    const balance = await ctx.publicClient.getBalance({ address: account.address })
    if (balance >= FUND_TARGET) continue

    if (testClient) {
      await testClient.setBalance({ address: account.address, value: FUND_TARGET })
    } else {
      const hash = await deployer.sendTransaction({
        to: account.address,
        value: FUND_TARGET - balance,
        chain: resolveChain(ctx.config.chainId),
        account: accounts.deployer,
      })
      await ctx.publicClient.waitForTransactionReceipt({ hash })
    }
    topped++
  }

  return topped
}

/**
 * Register every worker, skipping those already registered.
 *
 * `register()` uses `msg.sender`, so each worker must send its own transaction —
 * the deployer cannot register on their behalf.
 *
 * @returns how many workers were newly registered
 */
export async function ensureWorkersRegistered(ctx: ChainCtx, accounts: Accounts): Promise<number> {
  let registered = 0

  for (const worker of accounts.workers) {
    const already = await ctx.publicClient.readContract({
      address: ctx.addresses.workerRegistry,
      abi: WORKER_REGISTRY_ABI,
      functionName: 'isRegistered',
      args: [worker.address],
    })
    if (already) continue

    const wallet = ctx.walletClientFor(worker)
    const hash = await wallet.writeContract({
      address: ctx.addresses.workerRegistry,
      abi: WORKER_REGISTRY_ABI,
      functionName: 'register',
      args: [],
      chain: resolveChain(ctx.config.chainId),
      account: worker,
    })
    await ctx.publicClient.waitForTransactionReceipt({ hash })
    registered++
  }

  return registered
}
