'use client'

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { useRef, useState } from 'react'

export interface CarouselRating {
  jobId: string
  score: number
  comment: string
  jobTitle: string | null
  platformName: string | null
}

/**
 * Comments clients left in the seeded demo data, one at a time. They are real
 * rows from the demo record, never written for this page, and the section says
 * whose data it is. Keep the list short: every rating gets a portrait.
 */
export function RatingCarousel({ ratings }: { ratings: readonly CarouselRating[] }) {
  const [index, setIndex] = useState(0)
  const quote = useRef<HTMLDivElement>(null)
  const current = ratings[index]

  useGSAP(
    () => {
      const media = gsap.matchMedia()
      media.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(quote.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' })
      })
      return () => media.revert()
    },
    { dependencies: [index] },
  )

  if (current === undefined) return null
  const step = (delta: number) => setIndex((index + delta + ratings.length) % ratings.length)

  return (
    <div className="grid items-center gap-10 md:grid-cols-[auto_1fr] md:gap-16">
      <div className="flex -space-x-6" aria-hidden="true">
        {ratings.map((rating, position) => (
          <img
            key={rating.jobId}
            src={`https://picsum.photos/seed/client-${rating.jobId.slice(2, 10)}/240/240`}
            alt=""
            loading="lazy"
            className={`size-20 rounded-full border-4 border-[var(--color-bg)] object-cover grayscale transition-opacity duration-300 md:size-24 ${
              position === index ? 'opacity-100' : 'opacity-40'
            }`}
          />
        ))}
      </div>

      <div>
        <div ref={quote} aria-live="polite">
          <p className="text-[clamp(1.5rem,2.6vw,2.25rem)] font-medium leading-snug tracking-tight">
            <span className="text-[var(--color-fg-muted)]">&ldquo;</span>
            {current.comment}
            <span className="text-[var(--color-fg-muted)]">&rdquo;</span>
          </p>
          <p className="mt-6 text-[var(--color-fg-muted)]">
            <span className="tabular font-semibold text-[var(--color-accent)]">
              {current.score} of 5
            </span>
            {' for '}
            {current.jobTitle ?? 'a job'}
            {current.platformName === null ? '' : `, on ${current.platformName}`}
          </p>
        </div>
        <div className="mt-8 flex gap-3">
          <button type="button" onClick={() => step(-1)} aria-label="Previous rating" className="btn btn-ghost size-12 p-0">
            ←
          </button>
          <button type="button" onClick={() => step(1)} aria-label="Next rating" className="btn btn-ghost size-12 p-0">
            →
          </button>
        </div>
      </div>
    </div>
  )
}
