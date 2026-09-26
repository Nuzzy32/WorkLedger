import type { Address } from 'viem'

export interface DemoProfile {
  address: Address
  name: string
  kind: 'established' | 'new'
  note: string
}

/**
 * Two seeded workers the home page links to, so a visitor who types the bare
 * domain can reach a profile without already knowing a worker's address.
 *
 * Chosen as a pair because the pair is the argument: both carry a score, and
 * only one has enough history behind it to mean something.
 *
 * The notes describe the kind of history rather than quoting numbers. Counts
 * and scores change as ratings arrive; the profile page reads those live from
 * the chain, and a number written here would go stale without anyone noticing.
 */
export const DEMO_PROFILES: readonly DemoProfile[] = [
  {
    address: '0x98F6c93fdF6d28c4b04CFBad067a9C06ac04D5b0',
    name: 'Dewi A.',
    kind: 'established',
    note: 'An established history, rated across three platforms.',
  },
  {
    address: '0x768e1020DE29901535660bC1ce41b3199ebD278d',
    name: 'Leo A.',
    kind: 'new',
    note: 'A new account. A score exists, but too few ratings to judge.',
  },
]
