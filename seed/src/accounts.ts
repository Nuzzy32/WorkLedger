import { mnemonicToAccount } from 'viem/accounts'
import type { HDAccount } from 'viem'

const range = (start: number, count: number): number[] =>
  Array.from({ length: count }, (_, i) => start + i)

/**
 * Fixed derivation indices for every seed role.
 *
 * The ranges are disjoint and deliberately far apart so a worker can never also
 * be a client — `submitRating` reverts `SelfRatingForbidden()` in that case.
 */
export const ACCOUNT_INDICES = {
  deployer: 0,
  platforms: [1, 2, 3],
  clients: range(10, 20),
  workers: range(100, 40),
} as const

export interface Accounts {
  deployer: HDAccount
  platforms: HDAccount[]
  clients: HDAccount[]
  workers: HDAccount[]
}

/**
 * Derive all 64 seed accounts from one BIP-39 mnemonic.
 *
 * Determinism is load-bearing: it makes the run reproducible and lets an
 * interrupted seed resume without being told where it stopped.
 */
export function deriveAccounts(mnemonic: string): Accounts {
  const at = (addressIndex: number): HDAccount => mnemonicToAccount(mnemonic, { addressIndex })

  return {
    deployer: at(ACCOUNT_INDICES.deployer),
    platforms: ACCOUNT_INDICES.platforms.map(at),
    clients: ACCOUNT_INDICES.clients.map(at),
    workers: ACCOUNT_INDICES.workers.map(at),
  }
}
