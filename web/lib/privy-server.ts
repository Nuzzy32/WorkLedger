import { getAddress, isAddress, type Address } from 'viem'

export interface AuthEnv {
  privyAppId: string
  privyAppSecret: string
  /** SPKI PEM from the Privy dashboard, used to check access tokens. */
  privyVerificationKey: string
  /** Testnet key that pays for each worker's first registration. */
  dripPrivateKey: `0x${string}`
}

function required(source: Record<string, string | undefined>, name: string): string {
  const value = source[name]
  if (value === undefined || value === '') throw new Error(`${name} is not set`)
  return value
}

/**
 * Server-only settings for sign-in and the registration drip.
 *
 * Separate from readEnv on purpose: the public profile must keep working on a
 * deploy that never configured sign-in.
 */
export function readAuthEnv(source: Record<string, string | undefined>): AuthEnv {
  const dripPrivateKey = required(source, 'DRIP_PRIVATE_KEY')
  if (!/^0x[0-9a-fA-F]{64}$/.test(dripPrivateKey)) {
    throw new Error('DRIP_PRIVATE_KEY is not a 32-byte hex key')
  }

  return {
    privyAppId: required(source, 'NEXT_PUBLIC_PRIVY_APP_ID'),
    privyAppSecret: required(source, 'PRIVY_APP_SECRET'),
    // Env files cannot hold real newlines everywhere, so a PEM often arrives
    // with literal \n sequences.
    privyVerificationKey: required(source, 'PRIVY_VERIFICATION_KEY').replace(/\\n/g, '\n'),
    dripPrivateKey: dripPrivateKey as `0x${string}`,
  }
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  return new Uint8Array(Buffer.from(base64, 'base64'))
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '')
  return new Uint8Array(Buffer.from(body, 'base64'))
}

/**
 * Check a Privy access token and return the user id it was issued to, or null.
 *
 * Privy signs access tokens as ES256 JWTs. WebCrypto's ECDSA signature format
 * is the raw r||s pair JWS uses, so no JWT library is needed to verify one.
 */
export async function verifyPrivyToken(
  token: string,
  appId: string,
  verificationKeyPem: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string]

  let header: unknown
  let payload: unknown
  try {
    header = JSON.parse(Buffer.from(base64UrlToBytes(headerPart)).toString('utf8'))
    payload = JSON.parse(Buffer.from(base64UrlToBytes(payloadPart)).toString('utf8'))
  } catch {
    return null
  }

  // Pin the algorithm. Trusting the header's own claim is how "alg: none"
  // tokens get accepted.
  if (typeof header !== 'object' || header === null) return null
  if ((header as Record<string, unknown>).alg !== 'ES256') return null

  const key = await crypto.subtle.importKey(
    'spki',
    pemToDer(verificationKeyPem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  )
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    base64UrlToBytes(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  )
  if (!valid) return null

  if (typeof payload !== 'object' || payload === null) return null
  const claims = payload as Record<string, unknown>
  if (claims.iss !== 'privy.io') return null
  if (claims.aud !== appId) return null
  if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds) return null
  if (typeof claims.sub !== 'string' || claims.sub === '') return null

  return claims.sub
}

/**
 * The address of the wallet Privy created for this user, from a Privy user
 * record. Only the embedded wallet counts: a linked external wallet was not
 * made by this app and is not what the drip exists to fund.
 */
export function embeddedWalletOf(user: unknown): Address | null {
  if (typeof user !== 'object' || user === null) return null
  const accounts = (user as Record<string, unknown>).linked_accounts
  if (!Array.isArray(accounts)) return null

  for (const account of accounts) {
    if (typeof account !== 'object' || account === null) continue
    const record = account as Record<string, unknown>
    const embedded = record.wallet_client_type === 'privy' || record.connector_type === 'embedded'
    if (record.type !== 'wallet' || record.chain_type !== 'ethereum' || !embedded) continue
    if (typeof record.address === 'string' && isAddress(record.address)) {
      return getAddress(record.address)
    }
  }

  return null
}

/**
 * Look the user up on Privy's side, so the wallet to fund comes from Privy and
 * never from the request body.
 */
export async function fetchEmbeddedWallet(env: AuthEnv, userId: string): Promise<Address | null> {
  const credentials = Buffer.from(`${env.privyAppId}:${env.privyAppSecret}`).toString('base64')
  const response = await fetch(`https://auth.privy.io/api/v1/users/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Basic ${credentials}`, 'privy-app-id': env.privyAppId },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`privy user lookup failed: ${response.status}`)

  return embeddedWalletOf(await response.json())
}
