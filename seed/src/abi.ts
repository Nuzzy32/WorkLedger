export const PLATFORM_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'registerPlatform',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'signer', type: 'address' },
      { name: 'nameHash', type: 'bytes32' },
    ],
    outputs: [{ name: 'platformId', type: 'uint32' }],
  },
  {
    type: 'function',
    name: 'platformIdOf',
    stateMutability: 'view',
    inputs: [{ name: 'signer', type: 'address' }],
    outputs: [{ name: '', type: 'uint32' }],
  },
  {
    type: 'function',
    name: 'isActiveSigner',
    stateMutability: 'view',
    inputs: [{ name: 'signer', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

export const WORKER_REGISTRY_ABI = [
  { type: 'function', name: 'register', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  {
    type: 'function',
    name: 'isRegistered',
    stateMutability: 'view',
    inputs: [{ name: 'worker', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'statsOf',
    stateMutability: 'view',
    inputs: [{ name: 'worker', type: 'address' }],
    outputs: [
      { name: 'registeredAt', type: 'uint64' },
      { name: 'ratingCount', type: 'uint32' },
      { name: 'scoreSum', type: 'uint32' },
    ],
  },
] as const

const ATTESTATION_TUPLE = {
  name: 'att',
  type: 'tuple',
  components: [
    { name: 'jobId', type: 'bytes32' },
    { name: 'worker', type: 'address' },
    { name: 'client', type: 'address' },
    { name: 'completedAt', type: 'uint64' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const

export const RATING_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'submitRating',
    stateMutability: 'nonpayable',
    inputs: [
      ATTESTATION_TUPLE,
      { name: 'platformSignature', type: 'bytes' },
      { name: 'score', type: 'uint8' },
      { name: 'contentHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'ratingOf',
    stateMutability: 'view',
    inputs: [{ name: 'jobId', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'worker', type: 'address' },
          { name: 'platformId', type: 'uint32' },
          { name: 'score', type: 'uint8' },
          { name: 'client', type: 'address' },
          { name: 'submittedAt', type: 'uint64' },
          { name: 'contentHash', type: 'bytes32' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'scoreOf',
    stateMutability: 'view',
    inputs: [{ name: 'worker', type: 'address' }],
    outputs: [{ name: 'scoreBps', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'attestationDigest',
    stateMutability: 'view',
    inputs: [ATTESTATION_TUPLE],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const

/**
 * `jobId`, `worker`, and `client` are all indexed, which is what lets a resumed
 * run recover a rating's real transaction hash by filtering on jobId.
 */
export const RATING_SUBMITTED_EVENT = {
  type: 'event',
  name: 'RatingSubmitted',
  inputs: [
    { name: 'jobId', type: 'bytes32', indexed: true },
    { name: 'worker', type: 'address', indexed: true },
    { name: 'client', type: 'address', indexed: true },
    { name: 'platformId', type: 'uint32', indexed: false },
    { name: 'score', type: 'uint8', indexed: false },
  ],
} as const
