import { readFileSync } from 'node:fs'
import {
  createPublicClient,
  createWalletClient,
  createTestClient,
  http,
  parseEther,
  formatEther,
  zeroAddress,
  keccak256,
  stringToBytes,
  type Address,
  type Chain,
  type HDAccount,
  type Hex,
  type PublicClient,
} from 'viem'
import { foundry, baseSepolia } from 'viem/chains'
import { PLATFORM_REGISTRY_ABI, WORKER_REGISTRY_ABI, RATING_REGISTRY_ABI, RATING_SUBMITTED_EVENT } from './abi.ts'
import type { Config } from './config.ts'
import type { Accounts } from './accounts.ts'
import { expectedScoreBps, type SeedPlan } from './plan.ts'
import { signAttestation, type Attestation } from './attest.ts'

const ANVIL_CHAIN_ID = 31337

export interface Deployment {
  chainId: number
  block: bigint
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
    // vm.serializeUint writes "block" as a JSON number, not a string, so it
    // needs an explicit bigint conversion after parsing.
    const raw = JSON.parse(readFileSync(url, 'utf8')) as Omit<Deployment, 'block'> & { block: number }
    return { ...raw, block: BigInt(raw.block) }
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

/**
 * viem defaults to a 4000ms polling interval for `waitForTransactionReceipt`.
 * anvil mines instantly, so that default turns every submission into an
 * average ~2s wait for nothing. Base Sepolia actually needs to wait for
 * blocks (~2s block time), so polling faster there just burns RPC calls.
 */
function pollingIntervalFor(chainId: number): number {
  return chainId === ANVIL_CHAIN_ID ? 100 : 2_000
}

export function makeClients(config: Config) {
  const chain = resolveChain(config.chainId)
  const transport = http(config.rpcUrl)
  const pollingInterval = pollingIntervalFor(config.chainId)

  return {
    publicClient: createPublicClient({ chain, transport, pollingInterval }),
    walletClientFor: (account: HDAccount) =>
      createWalletClient({ account, chain, transport, pollingInterval }),
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
 * Per-account gas float.
 *
 * The busiest client sends roughly 45 `submitRating` transactions at about
 * 200k gas each; the whole 600-rating run costs well under 0.02 ETH on Base
 * Sepolia. anvil keeps a fat float because `anvil_setBalance` is free there
 * and anvil's default base fee opens at 1 gwei.
 */
function fundTargetFor(chainId: number): bigint {
  return chainId === ANVIL_CHAIN_ID ? parseEther('0.05') : parseEther('0.002')
}

/**
 * Give every worker and client enough balance to transact.
 *
 * On anvil, accounts derived from the project mnemonic start empty — anvil funds
 * only the first ten accounts of its own mnemonic, and our workers sit at
 * indices 100-139. `anvil_setBalance` avoids 60 funding transactions locally.
 *
 * Off anvil, funding is real transfers that can run out partway through, so
 * the total shortfall is checked against the deployer's balance up front —
 * failing once with both numbers rather than dying mid-run on an opaque
 * insufficient-funds error, leaving a half-funded account set.
 *
 * @returns how many addresses were topped up
 */
export async function ensureFunded(ctx: ChainCtx, accounts: Accounts): Promise<number> {
  const needFunding = [...accounts.workers, ...accounts.clients]
  const isAnvil = ctx.config.chainId === ANVIL_CHAIN_ID
  const fundTarget = fundTargetFor(ctx.config.chainId)

  const withBalances: { account: HDAccount; balance: bigint }[] = []
  for (const account of needFunding) {
    withBalances.push({ account, balance: await ctx.publicClient.getBalance({ address: account.address }) })
  }

  if (!isAnvil) {
    // anvil_setBalance cannot fail this way, so the precheck only matters off anvil.
    const shortfall = withBalances.reduce(
      (sum, { balance }) => (balance < fundTarget ? sum + (fundTarget - balance) : sum),
      0n,
    )
    const deployerBalance = await ctx.publicClient.getBalance({ address: accounts.deployer.address })
    if (deployerBalance < shortfall) {
      throw new Error(
        `deployer ${accounts.deployer.address} holds ${formatEther(deployerBalance)} ETH but needs ` +
          `at least ${formatEther(shortfall)} ETH to fund ${needFunding.length} accounts to ` +
          `${formatEther(fundTarget)} ETH each.`,
      )
    }
  }

  const testClient = isAnvil
    ? createTestClient({
        mode: 'anvil',
        chain: resolveChain(ctx.config.chainId),
        transport: http(ctx.config.rpcUrl),
      })
    : undefined

  const deployer = ctx.walletClientFor(accounts.deployer)
  let topped = 0

  for (const { account, balance } of withBalances) {
    if (balance >= fundTarget) continue

    if (testClient) {
      await testClient.setBalance({ address: account.address, value: fundTarget })
    } else {
      const hash = await deployer.sendTransaction({
        to: account.address,
        value: fundTarget - balance,
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

/**
 * Submit every rating in the plan, skipping any jobId already recorded.
 *
 * Idempotency: `ratingOf(jobId).worker != zeroAddress` means the rating landed.
 * A stored Rating can never have a zero worker, because `submitRating` rejects
 * unregistered workers and the zero address never registers — so the field is a
 * sound "already done" sentinel.
 *
 * Ratings are sent by the client, because `submitRating` requires
 * `msg.sender == att.client`.
 */
export async function submitRatings(
  ctx: ChainCtx,
  plan: SeedPlan,
): Promise<{ submitted: number; skipped: number; txHashes: Map<Hex, Hex> }> {
  const chain = resolveChain(ctx.config.chainId)
  const txHashes = new Map<Hex, Hex>()
  let submitted = 0
  let skipped = 0

  // One unbounded getLogs for the whole event, not one per skipped rating.
  // A resumed run can skip up to 600 ratings, and public Base Sepolia RPCs
  // cap eth_getLogs block ranges — 600 full-range requests would be throttled
  // or rejected there. Indexing once turns 600 requests into 1.
  //
  // fromBlock starts at the deployment block, not 0: the registry cannot have
  // emitted a log before the block it was deployed in, so scanning earlier is
  // both wasteful and, on a public RPC that caps the block range rather than
  // the request count, fatal — Base Sepolia is tens of millions of blocks in.
  const submittedLogs = await ctx.publicClient.getLogs({
    address: ctx.addresses.ratingRegistry,
    event: RATING_SUBMITTED_EVENT,
    fromBlock: ctx.addresses.block,
    toBlock: 'latest',
  })
  const knownTxHashes = new Map<Hex, Hex>()
  for (const log of submittedLogs) {
    const jobId = log.args.jobId
    if (jobId !== undefined && log.transactionHash !== null) {
      knownTxHashes.set(jobId, log.transactionHash)
    }
  }

  for (const rating of plan.ratings) {
    const existing = await ctx.publicClient.readContract({
      address: ctx.addresses.ratingRegistry,
      abi: RATING_REGISTRY_ABI,
      functionName: 'ratingOf',
      args: [rating.jobId],
    })

    if (existing.worker !== zeroAddress) {
      skipped++

      // Recover the REAL transaction hash from the indexed RatingSubmitted log.
      // A placeholder here would violate docs/DATA-MODEL.md's rule that no
      // Postgres row may exist without a confirmed transaction hash — and a
      // resumed run would then write rows that point at nothing.
      const recovered = knownTxHashes.get(rating.jobId)
      if (recovered === undefined) {
        throw new Error(
          `jobId ${rating.jobId} is on chain but has no RatingSubmitted log. ` +
            `Refusing to continue rather than fabricate a transaction hash.`,
        )
      }
      txHashes.set(rating.jobId, recovered)
      continue
    }

    // buildPlan draws workerIndex from [0, WORKER_COUNT), clientIndex from
    // [0, CLIENT_COUNT), and platformIndex from [0, PLATFORM_NAMES.length) —
    // exactly the sizes of accounts.workers (40), accounts.clients (20), and
    // accounts.platforms (3) — so each index is always in bounds.
    const worker = ctx.accounts.workers[rating.workerIndex]!
    const client = ctx.accounts.clients[rating.clientIndex]!
    const platform = ctx.accounts.platforms[rating.platformIndex]!

    const att: Attestation = {
      jobId: rating.jobId,
      worker: worker.address,
      client: client.address,
      completedAt: rating.completedAt,
      nonce: BigInt(rating.index),
    }

    const signature = await signAttestation(
      att,
      platform,
      ctx.config.chainId,
      ctx.addresses.ratingRegistry,
    )

    const wallet = ctx.walletClientFor(client)
    const hash = await wallet.writeContract({
      address: ctx.addresses.ratingRegistry,
      abi: RATING_REGISTRY_ABI,
      functionName: 'submitRating',
      args: [att, signature, rating.score, keccak256(stringToBytes(rating.comment))],
      chain,
      account: client,
    })
    await ctx.publicClient.waitForTransactionReceipt({ hash })

    txHashes.set(rating.jobId, hash)
    submitted++
  }

  return { submitted, skipped, txHashes }
}

export interface ScoreMismatch {
  workerIndex: number
  onChain: number
  expected: number
}

/**
 * Compare every worker's on-chain score against the plan-derived score.
 *
 * @returns `checked`, the number of workers actually compared, alongside the
 * mismatches. A caller must look at `checked`, not just `mismatches.length ===
 * 0` — an empty `ctx.accounts.workers` would also produce an empty mismatch
 * list, on zero comparisons rather than 40 passing ones.
 */
export async function verifyScores(
  ctx: ChainCtx,
  plan: SeedPlan,
): Promise<{ checked: number; mismatches: ScoreMismatch[] }> {
  const mismatches: ScoreMismatch[] = []
  let checked = 0

  for (const [workerIndex, worker] of ctx.accounts.workers.entries()) {
    const onChain = await ctx.publicClient.readContract({
      address: ctx.addresses.ratingRegistry,
      abi: RATING_REGISTRY_ABI,
      functionName: 'scoreOf',
      args: [worker.address],
    })
    const expected = expectedScoreBps(plan.ratings, workerIndex)
    checked++

    if (Number(onChain) !== expected) {
      mismatches.push({ workerIndex, onChain: Number(onChain), expected })
    }
  }

  return { checked, mismatches }
}
