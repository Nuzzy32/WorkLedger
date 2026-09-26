import { VerificationResult } from '../../../components/VerificationResult.tsx'

export default function WorkerNotFound() {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-32 pt-28 md:px-8 md:pt-32">
      <VerificationResult
        state="not-found"
        neutralRing={false}
        scoreBps={0}
        ratingCount={0}
        displayName={null}
        headline={null}
        cachedAt={null}
      />
    </main>
  )
}
