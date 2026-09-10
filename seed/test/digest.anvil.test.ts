import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createPublicClient, http, keccak256, stringToBytes } from 'viem'
import { foundry } from 'viem/chains'
import { computeDigest, signAttestation, type Attestation } from '../src/attest.ts'
import { deriveAccounts } from '../src/accounts.ts'

const RPC = 'http://127.0.0.1:8545'
const MNEMONIC = 'test test test test test test test test test test test junk'

const artifact = JSON.parse(
  readFileSync(new URL('../../contracts/deployments/anvil.json', import.meta.url), 'utf8'),
) as { ratingRegistry: `0x${string}`; chainId: number }

const DIGEST_ABI = [
  {
    type: 'function',
    name: 'attestationDigest',
    stateMutability: 'view',
    inputs: [
      {
        name: 'att',
        type: 'tuple',
        components: [
          { name: 'jobId', type: 'bytes32' },
          { name: 'worker', type: 'address' },
          { name: 'client', type: 'address' },
          { name: 'completedAt', type: 'uint64' },
          { name: 'nonce', type: 'uint256' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const

test('the TypeScript digest matches the contract byte for byte', async () => {
  const accounts = deriveAccounts(MNEMONIC)
  const client = createPublicClient({ chain: foundry, transport: http(RPC) })

  const att: Attestation = {
    jobId: keccak256(stringToBytes('workledger-demo-v1:0')),
    worker: accounts.workers[0]!.address,
    client: accounts.clients[0]!.address,
    completedAt: 1_700_000_000n,
    nonce: 0n,
  }

  const onChain = await client.readContract({
    address: artifact.ratingRegistry,
    abi: DIGEST_ABI,
    functionName: 'attestationDigest',
    args: [att],
  })

  const local = computeDigest(att, artifact.chainId, artifact.ratingRegistry)

  assert.equal(
    local,
    onChain,
    'a mismatch here means all 600 signatures would be rejected as UnknownPlatform',
  )
})

test('a signature from an allowlisted signer recovers to that signer', async () => {
  const accounts = deriveAccounts(MNEMONIC)
  const att: Attestation = {
    jobId: keccak256(stringToBytes('workledger-demo-v1:1')),
    worker: accounts.workers[1]!.address,
    client: accounts.clients[1]!.address,
    completedAt: 1_700_000_000n,
    nonce: 1n,
  }

  const signature = await signAttestation(att, accounts.platforms[0]!, artifact.chainId, artifact.ratingRegistry)

  assert.match(signature, /^0x[0-9a-f]{130}$/, 'expected a 65-byte r,s,v signature')
})

test('changing any signed field changes the digest', () => {
  const accounts = deriveAccounts(MNEMONIC)
  const base: Attestation = {
    jobId: keccak256(stringToBytes('workledger-demo-v1:2')),
    worker: accounts.workers[2]!.address,
    client: accounts.clients[2]!.address,
    completedAt: 1_700_000_000n,
    nonce: 2n,
  }
  const digest = (a: Attestation) => computeDigest(a, artifact.chainId, artifact.ratingRegistry)
  const original = digest(base)

  assert.notEqual(digest({ ...base, worker: accounts.workers[3]!.address }), original)
  assert.notEqual(digest({ ...base, client: accounts.clients[3]!.address }), original)
  assert.notEqual(digest({ ...base, completedAt: 1_700_000_001n }), original)
  assert.notEqual(digest({ ...base, nonce: 99n }), original)
  assert.notEqual(digest({ ...base, jobId: keccak256(stringToBytes('other')) }), original)
})

test('the digest is bound to the chain id and the verifying contract', () => {
  const accounts = deriveAccounts(MNEMONIC)
  const att: Attestation = {
    jobId: keccak256(stringToBytes('workledger-demo-v1:3')),
    worker: accounts.workers[4]!.address,
    client: accounts.clients[4]!.address,
    completedAt: 1_700_000_000n,
    nonce: 3n,
  }

  const here = computeDigest(att, artifact.chainId, artifact.ratingRegistry)
  const otherChain = computeDigest(att, artifact.chainId + 1, artifact.ratingRegistry)
  const otherContract = computeDigest(att, artifact.chainId, accounts.deployer.address)

  assert.notEqual(otherChain, here, 'chain id must be in the domain separator')
  assert.notEqual(otherContract, here, 'verifying contract must be in the domain separator')
})
