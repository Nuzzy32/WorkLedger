'use client'

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Link from 'next/link'
import { useRef } from 'react'
import type { DemoProfile } from '../lib/demo.ts'

gsap.registerPlugin(ScrollTrigger, useGSAP)

/**
 * Card stack. Each profile slides over the last, and the one underneath sinks
 * back as it is covered, so the pair reads as a comparison rather than a list.
 * Sticky positioning holds the cards; GSAP only scrubs the depth.
 */
export function ProfileStack({ profiles }: { profiles: readonly DemoProfile[] }) {
  const root = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const media = gsap.matchMedia()
      media.add('(prefers-reduced-motion: no-preference)', () => {
        const cards = gsap.utils.toArray<HTMLElement>('.stack-card')
        cards.forEach((card, index) => {
          const next = cards[index + 1]
          if (next === undefined) return
          gsap.to(card.firstElementChild, {
            scale: 0.92,
            opacity: 0.45,
            ease: 'none',
            scrollTrigger: { trigger: next, start: 'top bottom', end: 'top top+=96', scrub: true },
          })
        })
      })
      return () => media.revert()
    },
    { scope: root },
  )

  const cards = [
    ...profiles.map((profile) => ({
      key: profile.address,
      title: profile.name,
      body: profile.note,
      verdict: profile.kind === 'established' ? 'Verified' : 'Unproven',
      href: `/w/${profile.address}`,
      cta: 'Open the profile',
      image: `workledger-${profile.kind}-worker`,
    })),
    {
      key: 'yours',
      title: 'Yours',
      body: 'Every profile starts here, with no ratings and nothing to prove yet.',
      verdict: 'New',
      href: '/dashboard',
      cta: 'Sign in with Google',
      image: 'workledger-your-profile',
    },
  ]

  return (
    <div ref={root} className="flex flex-col gap-8">
      {cards.map((card, index) => (
        <div key={card.key} className="stack-card sticky" style={{ top: `${96 + index * 16}px` }}>
          <Link
            href={card.href}
            className="focus-ring group relative grid min-h-[60dvh] overflow-hidden rounded-[32px] border border-[var(--color-border)] bg-[var(--color-surface)] md:grid-cols-2"
          >
            <div className="flex flex-col justify-between gap-10 p-6 md:p-12">
              <div>
                <p
                  className={`text-sm font-semibold ${
                    card.verdict === 'Verified'
                      ? 'text-[var(--color-verified)]'
                      : card.verdict === 'Unproven'
                        ? 'text-[var(--color-caution)]'
                        : 'text-[var(--color-fg-muted)]'
                  }`}
                >
                  <span aria-hidden="true">{card.verdict === 'Verified' ? '✓ ' : card.verdict === 'Unproven' ? '! ' : '○ '}</span>
                  {card.verdict}
                </p>
                <h3 className="mt-4 text-[clamp(2.5rem,5vw,4.5rem)] font-semibold leading-none tracking-tighter">
                  {card.title}
                </h3>
                <p className="mt-6 max-w-[36ch] text-lg text-[var(--color-fg-muted)]">{card.body}</p>
              </div>
              <span className="btn btn-primary self-start">{card.cta}</span>
            </div>
            <div className="relative hidden overflow-hidden md:block">
              <img
                src={`https://picsum.photos/seed/${card.image}/1000/1200`}
                alt=""
                loading="lazy"
                className="absolute inset-0 size-full object-cover opacity-75 contrast-125 grayscale transition-transform duration-700 ease-out group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-surface)] to-transparent" />
            </div>
          </Link>
        </div>
      ))}
    </div>
  )
}
