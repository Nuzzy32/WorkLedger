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

const SUPPORTED_CHAIN_IDS = new Set([31337, 84532])

/**
 * Read and validate the environment.
 *
 * Accepts only the chains this project targets — local anvil (31337) and Base
 * Sepolia (84532). A denylist of "known mainnets" can never be complete, so
 * this is an allowlist instead: anything not explicitly supported is rejected,
 * mainnet or not.
 */
export function loadConfig(): Config {
  const chainId = Number(required('CHAIN_ID'))
  if (!Number.isInteger(chainId)) throw new ConfigError('CHAIN_ID must be an integer')
  if (!SUPPORTED_CHAIN_IDS.has(chainId)) {
    throw new ConfigError(
      `CHAIN_ID ${chainId} is not supported. Use 31337 (anvil) or 84532 (Base Sepolia).`,
    )
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
