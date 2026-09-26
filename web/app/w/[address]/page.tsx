import { notFound } from 'next/navigation'
import { AddressDisplay } from '../../../components/AddressDisplay.tsx'
import { PlatformChip } from '../../../components/PlatformChip.tsx'
import { ProfileQr } from '../../../components/ProfileQr.tsx'
import { RatingDistribution } from '../../../components/RatingDistribution.tsx'
import { RatingList } from '../../../components/RatingList.tsx'
import { VerificationResult } from '../../../components/VerificationResult.tsx'
import { normalizeAddress } from '../../../lib/address.ts'
import { explorerAddressUrl, explorerTxUrl } from '../../../lib/chain.ts'
import { readEnv } from '../../../lib/env.ts'
import { loadProfile } from '../../../lib/profile.ts'

export default async function WorkerProfilePage({
  params,
}: {
  params: Promise<{ address: string }>
}) {
  const { address } = await params
  const normalized = normalizeAddress(address)
  if (normalized === null) notFound()

  const env = readEnv(process.env)
  const { verdict, profile, scoreBps, ratingCount, databaseError } = await loadProfile(
    env,
    normalized.display,
  )

  if (verdict.state === 'not-found') notFound()

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-32 pt-28 md:gap-8 md:px-8 md:pt-32">
      <VerificationResult
        state={verdict.state}
        neutralRing={verdict.neutralRing}
        scoreBps={scoreBps}
        ratingCount={ratingCount}
        displayName={profile.displayName}
        headline={profile.headline}
        cachedAt={profile.cachedAt}
      />

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <AddressDisplay
          address={normalized.display}
          explorerUrl={explorerAddressUrl(env.chainId, normalized.display)}
        />
        {profile.platforms.length === 0 ? null : (
          <div className="flex flex-wrap gap-2">
            {profile.platforms.map((platform) => (
              <PlatformChip key={platform.id} platform={platform} />
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr] md:gap-8">
        <RatingDistribution distribution={profile.distribution} databaseError={databaseError} />
        <ProfileQr url={`${env.appOrigin}/w/${normalized.display}`} />
      </div>

      <RatingList
        ratings={profile.ratings}
        totalCount={ratingCount}
        databaseError={databaseError}
        explorerTxUrl={(txHash) => explorerTxUrl(env.chainId, txHash)}
      />
    </main>
  )
}
