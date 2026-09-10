import { hashTypedData, type Address, type Hex } from 'viem'
import type { HDAccount } from 'viem'

export type Attestation = {
  jobId: Hex
  worker: Address
  client: Address
  completedAt: bigint
  nonce: bigint
}

/**
 * Field order and types mirror `RatingRegistry.Attestation` exactly.
 * A divergence here rejects every signature as `UnknownPlatform()`, because the
 * digest recovers to an unrelated address that is not on the allowlist.
 */
export const ATTESTATION_TYPES = {
  Attestation: [
    { name: 'jobId', type: 'bytes32' },
    { name: 'worker', type: 'address' },
    { name: 'client', type: 'address' },
    { name: 'completedAt', type: 'uint64' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const

/** Domain name and version are fixed at `RatingRegistry.sol:93`. */
export function attestationDomain(chainId: number, verifyingContract: Address) {
  return { name: 'WorkLedger', version: '1', chainId, verifyingContract } as const
}

/** The EIP-712 digest a platform signs. Must equal `attestationDigest()` on chain. */
export function computeDigest(att: Attestation, chainId: number, verifyingContract: Address): Hex {
  return hashTypedData({
    domain: attestationDomain(chainId, verifyingContract),
    types: ATTESTATION_TYPES,
    primaryType: 'Attestation',
    message: att,
  })
}

/** Sign an attestation as a platform. Returns a 65-byte r,s,v signature. */
export async function signAttestation(
  att: Attestation,
  signer: HDAccount,
  chainId: number,
  verifyingContract: Address,
): Promise<Hex> {
  return signer.signTypedData({
    domain: attestationDomain(chainId, verifyingContract),
    types: ATTESTATION_TYPES,
    primaryType: 'Attestation',
    message: att,
  })
}
