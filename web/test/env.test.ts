import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readEnv } from '../lib/env.ts'

const complete = {
  CHAIN_ID: '31337',
  RPC_URL: 'http://127.0.0.1:8545',
  REPO_ROOT: '..',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_example',
  APP_ORIGIN: 'http://localhost:3000',
}

test('reads a complete environment', () => {
  assert.deepEqual(readEnv(complete), {
    chainId: 31337,
    rpcUrl: 'http://127.0.0.1:8545',
    repoRoot: '..',
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'sb_publishable_example',
    appOrigin: 'http://localhost:3000',
  })
})

test('names the missing variable rather than failing vaguely', () => {
  const { SUPABASE_ANON_KEY, ...incomplete } = complete
  assert.throws(() => readEnv(incomplete), /SUPABASE_ANON_KEY/)
})

test('rejects a chain id that is not a number', () => {
  assert.throws(() => readEnv({ ...complete, CHAIN_ID: 'base' }), /CHAIN_ID/)
})

test('refuses a database connection string in place of the anon key', () => {
  assert.throws(
    () => readEnv({ ...complete, SUPABASE_ANON_KEY: 'postgresql://user:pass@host:5432/postgres' }),
    /anon key/,
  )
})
