import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createPublicClient,
  http,
  isAddress,
  parseAbi,
  type Address,
  type Chain,
  type PublicClient,
} from 'viem'
import { anvil, baseSepolia } from 'viem/chains'

const DEPLOYMENT_FILES: Record<number, string> = {
  [anvil.id]: 'anvil.json',
  [baseSepolia.id]: 'base-sepolia.json',
}

// Typed as the generic `Chain`, not `typeof anvil | typeof baseSepolia`:
// baseSepolia carries OP-stack block/transaction formatters that are
// structurally incompatible with the plain `PublicClient` export used below.
// We never call the formatted block/transaction actions here (only
// readContract), so widening away the formatter types costs nothing at
// runtime — the actual chain objects, formatters included, are unchanged.
const CHAINS: Record<number, Chain> = { [anvil.id]: anvil, [baseSepolia.id]: baseSepolia }

export const workerRegistryAbi = parseAbi([
  'function isRegistered(address worker) view returns (bool)',
  'function statsOf(address worker) view returns (uint64 registeredAt, uint32 ratingCount, uint32 scoreSum)',
])

export const ratingRegistryAbi = parseAbi([
  'function scoreOf(address worker) view returns (uint256 scoreBps)',
])

export const platformRegistryAbi = parseAbi([
  'struct Platform { address signer; uint64 registeredAt; bool active; bytes32 nameHash; }',
  'function platformAt(uint32 platformId) view returns (Platform)',
])

export interface Deployment {
  chainId: number
  block: number
  platformRegistry: Address
  ratingRegistry: Address
  workerRegistry: Address
}

function requireAddress(value: unknown, field: string): Address {
  if (typeof value !== 'string' || !isAddress(value)) {
    throw new Error(`deployment field ${field} is not an address: ${String(value)}`)
  }
  return value
}

export function parseDeployment(value: unknown): Deployment {
  if (typeof value !== 'object' || value === null) {
    throw new Error('deployment is not an object')
  }

  const record = value as Record<string, unknown>
  const chainId = record.chainId
  const block = record.block

  if (typeof chainId !== 'number') throw new Error('deployment field chainId is not a number')
  if (typeof block !== 'number') throw new Error('deployment field block is not a number')

  return {
    chainId,
    block,
    platformRegistry: requireAddress(record.platformRegistry, 'platformRegistry'),
    ratingRegistry: requireAddress(record.ratingRegistry, 'ratingRegistry'),
    workerRegistry: requireAddress(record.workerRegistry, 'workerRegistry'),
  }
}

export function deploymentPath(chainId: number, repoRoot: string): string {
  const file = DEPLOYMENT_FILES[chainId]
  if (file === undefined) throw new Error(`no deployment file for chain id ${chainId}`)
  return join(repoRoot, 'contracts', 'deployments', file)
}

export function loadDeployment(chainId: number, repoRoot: string): Deployment {
  const path = deploymentPath(chainId, repoRoot)
  const deployment = parseDeployment(JSON.parse(readFileSync(path, 'utf8')))

  if (deployment.chainId !== chainId) {
    throw new Error(
      `${path} holds chain id ${deployment.chainId}, but chain id ${chainId} was asked for`,
    )
  }

  return deployment
}

/**
 * A block explorer link, or null where there is no explorer.
 *
 * anvil has none. A dead Basescan link is worse than no link, because the
 * verifier who clicks it is exactly the person checking the raw record.
 */
export function explorerAddressUrl(chainId: number, address: string): string | null {
  return chainId === baseSepolia.id ? `https://sepolia.basescan.org/address/${address}` : null
}

export function explorerTxUrl(chainId: number, txHash: string): string | null {
  return chainId === baseSepolia.id ? `https://sepolia.basescan.org/tx/${txHash}` : null
}

export function createChainClient(chainId: number, rpcUrl: string): PublicClient {
  const chain = CHAINS[chainId as keyof typeof CHAINS]
  if (chain === undefined) throw new Error(`unsupported chain id ${chainId}`)

  return createPublicClient({ chain, transport: http(rpcUrl) })
}

export interface WorkerChainState {
  registered: boolean
  /** Unix seconds. 0 when unregistered. */
  registeredAt: number
  ratingCount: number
  /** Basis points. Carries the prior baseline even when unregistered. */
  scoreBps: number
}

export async function readWorkerChainState(
  client: PublicClient,
  deployment: Deployment,
  worker: Address,
): Promise<WorkerChainState> {
  const [registered, stats, scoreBps] = await Promise.all([
    client.readContract({
      address: deployment.workerRegistry,
      abi: workerRegistryAbi,
      functionName: 'isRegistered',
      args: [worker],
    }),
    client.readContract({
      address: deployment.workerRegistry,
      abi: workerRegistryAbi,
      functionName: 'statsOf',
      args: [worker],
    }),
    client.readContract({
      address: deployment.ratingRegistry,
      abi: ratingRegistryAbi,
      functionName: 'scoreOf',
      args: [worker],
    }),
  ])

  const [registeredAt, ratingCount] = stats

  return {
    registered,
    registeredAt: Number(registeredAt),
    ratingCount: Number(ratingCount),
    scoreBps: Number(scoreBps),
  }
}

/**
 * Active flag per platform id.
 *
 * Reads the chain rather than Postgres because the platforms table has no
 * active column: whether a platform may still issue attestations is the
 * chain's answer. The struct's nameHash is deliberately ignored — the display
 * name lives in Postgres, and a bytes32 is not a name.
 */
export async function readPlatformActivity(
  client: PublicClient,
  deployment: Deployment,
  platformIds: readonly number[],
): Promise<Map<number, boolean>> {
  const unique = [...new Set(platformIds)]

  const records = await Promise.all(
    unique.map((id) =>
      client.readContract({
        address: deployment.platformRegistry,
        abi: platformRegistryAbi,
        functionName: 'platformAt',
        args: [id],
      }),
    ),
  )

  return new Map(unique.map((id, index) => [id, records[index]?.active ?? false]))
}
