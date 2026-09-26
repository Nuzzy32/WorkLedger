'use client'

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useRef } from 'react'

gsap.registerPlugin(ScrollTrigger, useGSAP)

const STEPS = [
  {
    title: 'Sign in',
    body: 'Google sign-in creates your profile. Nothing to install, nothing to write down.',
    image: 'workledger-sign-in-desk',
  },
  {
    title: 'Finish a job',
    body: 'The platform that ran the job signs a note saying it happened. No note, no rating.',
    image: 'workledger-courier-route',
  },
  {
    title: 'Get rated',
    body: 'Your client scores it from 1 to 5. The score is recorded for good. The comment stays deletable.',
    image: 'workledger-handover-door',
  },
  {
    title: 'Take it anywhere',
    body: 'Share one link. The next platform reads your whole history in seconds, from any phone.',
    image: 'workledger-new-city',
  },
] as const

/**
 * Pinned split: the title holds still on the left while the steps pass on the
 * right, so the reader always knows which story the images belong to. The
 * counter tracks the step in view. Phones and reduced motion get a plain stack.
 */
export function HowItWorks() {
  const root = useRef<HTMLElement>(null)
  const counter = useRef<HTMLSpanElement>(null)

  useGSAP(
    () => {
      const media = gsap.matchMedia()
      media.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
        ScrollTrigger.create({
          trigger: '.how-steps',
          start: 'top top+=128',
          end: 'bottom bottom',
          pin: '.how-title',
          pinSpacing: false,
        })

        gsap.utils.toArray<HTMLElement>('.how-step').forEach((step, index) => {
          ScrollTrigger.create({
            trigger: step,
            start: 'top center',
            end: 'bottom center',
            onToggle: (self) => {
              if (self.isActive && counter.current) {
                counter.current.textContent = `${index + 1} of ${STEPS.length}`
              }
            },
          })
          gsap.fromTo(
            step.querySelector('img'),
            { scale: 1.12 },
            {
              scale: 1,
              ease: 'none',
              scrollTrigger: { trigger: step, start: 'top bottom', end: 'bottom top', scrub: true },
            },
          )
        })
      })
      return () => media.revert()
    },
    { scope: root },
  )

  return (
    <section ref={root} id="how" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-32 md:px-8 md:py-48">
      <div className="grid gap-12 md:grid-cols-[5fr_7fr] md:gap-16">
        <div>
          <div className="how-title">
            <h2 className="text-[clamp(2.25rem,4vw,3.75rem)] font-semibold leading-[1.05] tracking-tighter">
              From a finished job to a record you own
            </h2>
            <p className="mt-6 max-w-[40ch] text-lg text-[var(--color-fg-muted)]">
              Four things happen, and only one of them needs you to do anything.
            </p>
            <span
              ref={counter}
              aria-hidden="true"
              className="tabular mt-10 hidden font-mono text-sm text-[var(--color-accent)] md:block"
            >
              1 of {STEPS.length}
            </span>
          </div>
        </div>

        <ol className="how-steps flex flex-col gap-8 md:gap-24">
          {STEPS.map((step) => (
            <li key={step.title} className="how-step group">
              <div className="overflow-hidden rounded-[28px] border border-[var(--color-border)]">
                {/* Hover scales the wrapper; the scroll scrub owns the image's
                    own transform, and the two would overwrite each other. */}
                <div className="transition-transform duration-700 ease-out group-hover:scale-105">
                  <img
                    src={`https://picsum.photos/seed/${step.image}/1200/800`}
                    alt=""
                    loading="lazy"
                    className="aspect-[3/2] w-full object-cover opacity-80 contrast-125 grayscale"
                  />
                </div>
              </div>
              <h3 className="mt-6 text-2xl font-semibold tracking-tight md:text-3xl">{step.title}</h3>
              <p className="mt-2 max-w-[48ch] text-lg text-[var(--color-fg-muted)]">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
