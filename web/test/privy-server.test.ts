import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { embeddedWalletOf, readAuthEnv, verifyPrivyToken } from '../lib/privy-server.ts'

const APP_ID = 'app-under-test'
const NOW = 1_800_000_000

function b64url(value: string | Uint8Array): string {
  return Buffer.from(value).toString('base64url')
}

async function keyPair() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])
  const spki = Buffer.from(await crypto.subtle.exportKey('spki', pair.publicKey)).toString('base64')
  return { privateKey: pair.privateKey, pem: `-----BEGIN PUBLIC KEY-----\n${spki}\n-----END PUBLIC KEY-----` }
}

async function sign(privateKey: CryptoKey, header: object, claims: object): Promise<string> {
  const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(body),
  )
  return `${body}.${b64url(new Uint8Array(signature))}`
}

const GOOD = { iss: 'privy.io', aud: APP_ID, sub: 'did:privy:abc', exp: NOW + 60 }

test('a well-formed token yields its user id', async () => {
  const { privateKey, pem } = await keyPair()
  const token = await sign(privateKey, { alg: 'ES256', typ: 'JWT' }, GOOD)
  assert.equal(await verifyPrivyToken(token, APP_ID, pem, NOW), 'did:privy:abc')
})

test('a token signed by another key is rejected', async () => {
  const { pem } = await keyPair()
  const other = await keyPair()
  const token = await sign(other.privateKey, { alg: 'ES256' }, GOOD)
  assert.equal(await verifyPrivyToken(token, APP_ID, pem, NOW), null)
})

test('expired, wrong audience, wrong issuer, and alg none are all rejected', async () => {
  const { privateKey, pem } = await keyPair()
  const cases = [
    [{ alg: 'ES256' }, { ...GOOD, exp: NOW }],
    [{ alg: 'ES256' }, { ...GOOD, aud: 'someone-else' }],
    [{ alg: 'ES256' }, { ...GOOD, iss: 'evil.example' }],
    [{ alg: 'none' }, GOOD],
  ] as const
  for (const [header, claims] of cases) {
    const token = await sign(privateKey, header, claims)
    assert.equal(await verifyPrivyToken(token, APP_ID, pem, NOW), null, JSON.stringify(claims))
  }
})

test('garbage is rejected rather than thrown', async () => {
  const { pem } = await keyPair()
  assert.equal(await verifyPrivyToken('not.a.token', APP_ID, pem, NOW), null)
  assert.equal(await verifyPrivyToken('onlyonepart', APP_ID, pem, NOW), null)
})

test('only the embedded ethereum wallet is picked', () => {
  const user = {
    linked_accounts: [
      { type: 'google_oauth', email: 'x' },
      { type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'metamask', address: '0x0000000000000000000000000000000000000001' },
      { type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'privy', address: '0x98f6c93fdf6d28c4b04cfbad067a9c06ac04d5b0' },
    ],
  }
  assert.equal(embeddedWalletOf(user), '0x98F6c93fdF6d28c4b04CFBad067a9C06ac04D5b0')
  assert.equal(embeddedWalletOf({ linked_accounts: [] }), null)
  assert.equal(embeddedWalletOf(null), null)
})

test('the auth env rejects a malformed drip key and unescapes the PEM', () => {
  const base = {
    NEXT_PUBLIC_PRIVY_APP_ID: 'a',
    PRIVY_APP_SECRET: 'b',
    PRIVY_VERIFICATION_KEY: 'line1\\nline2',
    DRIP_PRIVATE_KEY: `0x${'1'.repeat(64)}`,
  }
  assert.equal(readAuthEnv(base).privyVerificationKey, 'line1\nline2')
  assert.throws(() => readAuthEnv({ ...base, DRIP_PRIVATE_KEY: '0x1234' }), /DRIP_PRIVATE_KEY/)
  assert.throws(() => readAuthEnv({ ...base, PRIVY_APP_SECRET: '' }), /PRIVY_APP_SECRET/)
})
