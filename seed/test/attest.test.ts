import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ATTESTATION_TYPES } from '../src/attest.ts'

// Offline guard against a self-consistent but wrong `ATTESTATION_TYPES` (e.g.
// two fields swapped or retyped). Tests that only exercise `computeDigest`
// against itself can't catch that class of bug — they'd stay internally
// consistent either way. EIP-712's type hash is keccak256 of a canonical
// string built from the type definition, so pinning that string here catches
// a field-order or field-type mistake with no chain required. Needs no anvil
// — it belongs in its own file so it runs under a plain `npm test` even when
// `digest.anvil.test.ts`'s chain-dependent tests can't.
test('the EIP-712 encoded type string matches the contract literal', () => {
  const fields = ATTESTATION_TYPES.Attestation.map((f) => `${f.type} ${f.name}`).join(',')
  const encodedType = `Attestation(${fields})`

  assert.equal(
    encodedType,
    'Attestation(bytes32 jobId,address worker,address client,uint64 completedAt,uint256 nonce)',
    'ATTESTATION_TYPES no longer matches the literal at contracts/src/RatingRegistry.sol:48-50',
  )
})
