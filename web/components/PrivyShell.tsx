'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import { anvil, baseSepolia } from 'viem/chains'

/**
 * Sign-in for the dashboard only. The public profile never loads this: a
 * verifier has no account, and the auth bundle would only slow their phone.
 */
export function PrivyShell({
  appId,
  chainId,
  children,
}: {
  appId: string
  chainId: number
  children: React.ReactNode
}) {
  const chain = chainId === anvil.id ? anvil : baseSepolia

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['google'],
        defaultChain: chain,
        supportedChains: [chain],
        appearance: { theme: 'dark', accentColor: '#8FE3B8' },
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
          // Registration is the only transaction, and the page explains it
          // itself. A second confirmation screen would only add a step.
          showWalletUIs: false,
        },
      }}
    >
      {children}
    </PrivyProvider>
  )
}
