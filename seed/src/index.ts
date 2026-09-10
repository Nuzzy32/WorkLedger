import { loadConfig } from './config.ts'
import { deriveAccounts } from './accounts.ts'
import { buildPlan, expectedScoreBps } from './plan.ts'
import {
  loadDeployment,
  makeClients,
  ensurePlatforms,
  ensureFunded,
  ensureWorkersRegistered,
  submitRatings,
  verifyScores,
  type ChainCtx,
} from './chain.ts'
import { toPlatformRow, toWorkerRow, toRatingRow, writeAll, type AllRows } from './db.ts'

const WORKER_NAMES = [
  'Sari W.', 'Budi P.', 'Dewi A.', 'Agus S.', 'Rina M.', 'Joko H.', 'Lina K.', 'Rudi T.',
  'Maya L.', 'Eko N.', 'Fitri R.', 'Hadi W.', 'Indah S.', 'Kurnia B.', 'Lukman A.', 'Mira D.',
  'Nanda P.', 'Oki R.', 'Putri H.', 'Qori M.', 'Ratna S.', 'Surya B.', 'Tia N.', 'Umar F.',
  'Vina A.', 'Wawan G.', 'Yuni P.', 'Zaki R.', 'Anisa T.', 'Bayu K.', 'Citra L.', 'Dani M.',
  'Endah W.', 'Faisal H.', 'Gita S.', 'Hendra B.', 'Ika R.', 'Jaya N.', 'Kirana D.', 'Leo A.',
] as const

const HEADLINES = [
  'Courier, motorbike',
  'Home cleaning',
  'Appliance repair',
  'Grocery shopper',
  'Furniture assembly',
] as const

async function main(): Promise<void> {
  const config = loadConfig()
  const accounts = deriveAccounts(config.mnemonic)
  const addresses = loadDeployment(config.chainId)
  const { publicClient, walletClientFor } = makeClients(config)
  const ctx: ChainCtx = { config, accounts, addresses, publicClient, walletClientFor }
  const plan = buildPlan(config.seedTag)

  console.log(`chain ${config.chainId} via ${config.rpcUrl}`)
  console.log(`ratingRegistry ${addresses.ratingRegistry}`)
  console.log(`seed tag "${config.seedTag}" -> ${plan.ratings.length} ratings`)

  const platformIds = await ensurePlatforms(ctx, plan)
  console.log(`platforms ready: ${platformIds.join(', ')}`)

  const funded = await ensureFunded(ctx, accounts)
  console.log(`funded ${funded} address(es)`)

  const registered = await ensureWorkersRegistered(ctx, accounts)
  console.log(`registered ${registered} worker(s)`)

  const { submitted, skipped, txHashes } = await submitRatings(ctx, plan)
  console.log(`ratings submitted ${submitted}, already present ${skipped}`)

  const { checked, mismatches } = await verifyScores(ctx, plan)
  if (mismatches.length > 0) {
    console.error('SCORE MISMATCH — the chain disagrees with the plan:')
    for (const m of mismatches) {
      console.error(`  worker ${m.workerIndex}: on chain ${m.onChain}, expected ${m.expected}`)
    }
    process.exitCode = 1
    return
  }
  console.log(`all ${checked} worker scores match the plan`)

  if (config.databaseUrl === undefined) {
    console.log('DATABASE_URL not set — skipping Postgres writes (chain-only run)')
    return
  }

  const counts = new Map<number, number>()
  for (const r of plan.ratings) counts.set(r.workerIndex, (counts.get(r.workerIndex) ?? 0) + 1)

  const rows: AllRows = {
    platforms: plan.platforms.map((p, i) =>
      // ensurePlatforms pushes exactly one id per entry of plan.platforms, in
      // order, so platformIds has the same length and index alignment.
      toPlatformRow(platformIds[i]!, p.name),
    ),
    workers: accounts.workers.map((w, i) =>
      toWorkerRow(
        w.address,
        // Fall back rather than assert: raising the worker count above
        // WORKER_NAMES.length must not let undefined reach display_name.
        WORKER_NAMES[i] ?? `Worker ${i}`,
        // i % HEADLINES.length is always in [0, HEADLINES.length), and
        // HEADLINES is a fixed non-empty literal, so this always resolves.
        HEADLINES[i % HEADLINES.length]!,
        expectedScoreBps(plan.ratings, i),
        counts.get(i) ?? 0,
      ),
    ),
    ratings: plan.ratings.map((r) =>
      toRatingRow(r, {
        // buildPlan draws workerIndex/clientIndex/platformIndex from exactly
        // the sizes of accounts.workers/clients and plan.platforms (see the
        // matching invariant comment in chain.ts submitRatings), so each
        // index below is always in bounds.
        workerAddress: accounts.workers[r.workerIndex]!.address,
        clientAddress: accounts.clients[r.clientIndex]!.address,
        platformId: platformIds[r.platformIndex]!,
        txHash: txHashes.get(r.jobId),
        submittedAt: new Date(),
      }),
    ),
  }

  await writeAll(config.databaseUrl, rows)
  console.log(`postgres: ${rows.platforms.length} platforms, ${rows.workers.length} workers, ${rows.ratings.length} ratings`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
