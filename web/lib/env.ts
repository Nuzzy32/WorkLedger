export interface AppEnv {
  chainId: number
  rpcUrl: string
  repoRoot: string
  supabaseUrl: string
  supabaseAnonKey: string
  appOrigin: string
}

function required(source: Record<string, string | undefined>, name: string): string {
  const value = source[name]
  if (value === undefined || value === '') throw new Error(`${name} is not set`)
  return value
}

export function readEnv(source: Record<string, string | undefined>): AppEnv {
  const chainId = Number(required(source, 'CHAIN_ID'))
  if (!Number.isInteger(chainId)) throw new Error('CHAIN_ID is not an integer')

  const supabaseAnonKey = required(source, 'SUPABASE_ANON_KEY')
  if (supabaseAnonKey.startsWith('postgres')) {
    throw new Error(
      'SUPABASE_ANON_KEY holds a connection string. This application reads with the publishable anon key only.',
    )
  }

  return {
    chainId,
    rpcUrl: required(source, 'RPC_URL'),
    repoRoot: required(source, 'REPO_ROOT'),
    supabaseUrl: required(source, 'SUPABASE_URL'),
    supabaseAnonKey,
    appOrigin: required(source, 'APP_ORIGIN'),
  }
}
