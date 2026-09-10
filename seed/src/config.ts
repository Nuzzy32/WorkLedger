export interface Config {
  rpcUrl: string
  chainId: number
  mnemonic: string
  seedTag: string
  databaseUrl?: string
  basescanApiKey?: string
}

class ConfigError extends Error {}

function required(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.trim() === '') {
    throw new ConfigError(`${name} is required. Copy .env.example to .env and fill it in.`)
  }
  return value
}

const MAINNET_CHAIN_IDS = new Set([1, 8453, 10, 137, 42161, 56])

/**
 * Read and validate the environment.
 *
 * Rejects mainnet chain ids outright: this project is testnet-only by rule, and
 * a mistyped id is the cheapest way to break that rule by accident.
 */
export function loadConfig(): Config {
  const chainId = Number(required('CHAIN_ID'))
  if (!Number.isInteger(chainId)) throw new ConfigError('CHAIN_ID must be an integer')
  if (MAINNET_CHAIN_IDS.has(chainId)) {
    throw new ConfigError(`CHAIN_ID ${chainId} is a mainnet. This project is testnet-only.`)
  }

  return {
    rpcUrl: required('RPC_URL'),
    chainId,
    mnemonic: required('MNEMONIC'),
    seedTag: required('SEED_TAG'),
    databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
    basescanApiKey: process.env.BASESCAN_API_KEY?.trim() || undefined,
  }
}
