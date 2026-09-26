import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { chainFor, createChainClient, loadDeployment } from '../../../lib/chain.ts'
import { dripForRegistration } from '../../../lib/drip.ts'
import { readEnv } from '../../../lib/env.ts'
import { fetchEmbeddedWallet, readAuthEnv, verifyPrivyToken } from '../../../lib/privy-server.ts'

// Wallets with a drip in progress on this instance. Stops a double click from
// paying twice; the chain-side rule in dripForRegistration covers the rest.
const inFlight = new Set<string>()

function reply(status: number, body: Record<string, string>): Response {
  return Response.json(body, { status })
}

/**
 * Pays for a signed-in worker's first registration.
 *
 * The wallet funded is the one Privy says belongs to the token's user, never
 * an address from the request, so a caller cannot point the drip anywhere.
 */
export async function POST(request: Request): Promise<Response> {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  if (token === '') return reply(401, { error: 'Sign in first.' })

  let worker: string | null = null
  try {
    const env = readEnv(process.env)
    const auth = readAuthEnv(process.env)

    const userId = await verifyPrivyToken(token, auth.privyAppId, auth.privyVerificationKey)
    if (userId === null) return reply(401, { error: 'Sign in first.' })

    const wallet = await fetchEmbeddedWallet(auth, userId)
    if (wallet === null) return reply(409, { error: 'No account key yet. Try again shortly.' })

    const key = wallet.toLowerCase()
    if (inFlight.has(key)) return reply(429, { error: 'Already in progress.' })
    inFlight.add(key)
    // Only the request that took the slot may release it.
    worker = key

    const chain = chainFor(env.chainId)
    const faucet = createWalletClient({
      account: privateKeyToAccount(auth.dripPrivateKey),
      chain,
      transport: http(env.rpcUrl),
    })
    const result = await dripForRegistration(
      createChainClient(env.chainId, env.rpcUrl),
      faucet,
      loadDeployment(env.chainId, env.repoRoot),
      wallet,
    )

    if (result.status === 'not-eligible') {
      return reply(409, { error: 'This account already used its setup allowance.' })
    }
    return reply(200, { status: result.status })
  } catch (error) {
    // Detail stays in the server log. The browser gets a sentence it can show.
    console.error('register-gas failed', error)
    return reply(500, { error: 'Setup could not be completed. Try again.' })
  } finally {
    if (worker !== null) inFlight.delete(worker)
  }
}
