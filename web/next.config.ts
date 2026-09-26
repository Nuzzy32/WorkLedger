import type { NextConfig } from 'next'

// Optional peers of @privy-io/react-auth for features this app never turns on
// (card onramp, Farcaster mini apps). .npmrc skips installing them, so resolve them to nothing
// rather than add packages no code path reaches.
const UNUSED_PRIVY_PEERS = ['@stripe/stripe-js', '@farcaster/mini-app-solana']

const nextConfig: NextConfig = {
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...Object.fromEntries(UNUSED_PRIVY_PEERS.map((name) => [name, false])),
    }
    return config
  },
}

export default nextConfig
