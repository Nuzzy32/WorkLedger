import { VerificationResult } from '../../../components/VerificationResult.tsx'

export default function WorkerNotFound() {
  return (
    <main>
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
