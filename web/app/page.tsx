import Link from 'next/link'
import { HowItWorks } from '../components/HowItWorks.tsx'
import { ProfileStack } from '../components/ProfileStack.tsx'
import { RatingCarousel, type CarouselRating } from '../components/RatingCarousel.tsx'
import { createDatabaseClient, fetchRatingRows, toProfileView } from '../lib/db.ts'
import { DEMO_PROFILES } from '../lib/demo.ts'
import { readEnv } from '../lib/env.ts'

// The carousel reads the demo record. Five minutes of staleness costs nothing
// on a landing page and keeps the database out of every visit.
export const revalidate = 300

const PLATFORMS = ['Kurirku', 'Tukangku', 'Rampung'] as const

const LIMITS = [
  {
    title: 'Fake accounts',
    body: 'Creating addresses is free, but a rating needs a platform to sign for a real job. Steal a platform key and this defense is gone.',
  },
  {
    title: 'Starting over',
    body: 'A fresh profile starts at 3.00, below a typical average. A worker already under 3.00 still gains by resetting. That stays unsolved.',
  },
  {
    title: 'Rating rings',
    body: 'Friends rating friends on fake jobs is only made more expensive, not stopped. Catching it needs traffic this demo does not have.',
  },
  {
    title: 'One owner key',
    body: 'A single key decides which platforms may issue ratings. It cannot touch anyone’s score, but it is not decentralized, and this page says so.',
  },
] as const

async function demoComments(): Promise<CarouselRating[]> {
  const established = DEMO_PROFILES.find((profile) => profile.kind === 'established')
  if (established === undefined) return []
  try {
    const env = readEnv(process.env)
    const database = createDatabaseClient(env.supabaseUrl, env.supabaseAnonKey)
    const rows = await fetchRatingRows(database, established.address.toLowerCase())
    return toProfileView(null, rows, null)
      .ratings.filter((rating) => rating.comment !== null)
      .slice(0, 4)
      .map((rating) => ({
        jobId: rating.jobId,
        score: rating.score,
        comment: rating.comment ?? '',
        jobTitle: rating.jobTitle,
        platformName: rating.platformName,
      }))
  } catch {
    // The section is decoration on this page. Without the database it is left out.
    return []
  }
}

export default async function HomePage() {
  const comments = await demoComments()
  const demo = DEMO_PROFILES[0]

  return (
    <main>
      {/* Attention: editorial split, text left, one image right, room to breathe. */}
      <section className="relative isolate overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute -left-40 -top-40 -z-10 size-[42rem] rounded-full bg-[var(--color-accent)] opacity-[0.07] blur-[120px]"
        />
        <div className="mx-auto grid min-h-[100dvh] max-w-6xl items-center gap-12 px-4 pb-16 pt-28 md:grid-cols-[7fr_5fr] md:gap-16 md:px-8 md:pt-24">
          <div className="animate-rise">
            <h1 className="max-w-5xl text-[clamp(2.75rem,5vw,4.75rem)] font-semibold leading-[1.02] tracking-tighter">
              Ratings that follow you to every platform.
            </h1>
            <p className="mt-6 max-w-[44ch] text-lg text-[var(--color-fg-muted)] md:text-xl">
              Earn ratings on one app and show them on the next. Anyone can check the record,
              no account needed.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/dashboard" className="btn btn-primary">
                Sign in with Google
              </Link>
              {demo === undefined ? null : (
                <Link href={`/w/${demo.address}`} className="btn btn-ghost">
                  See a live profile
                </Link>
              )}
            </div>
          </div>
          <div className="relative animate-rise [animation-delay:120ms]">
            <div className="overflow-hidden rounded-[32px] border border-[var(--color-border)]">
              <img
                src="https://picsum.photos/seed/workledger-courier-dusk/1000/1250"
                alt=""
                fetchPriority="high"
                className="aspect-[4/5] w-full object-cover opacity-85 contrast-125 grayscale"
              />
            </div>
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-[32px] bg-[radial-gradient(ellipse_at_bottom,rgb(11_11_12/0.7),transparent_60%)]"
            />
          </div>
        </div>
      </section>

      {/* The issuing platforms in the demo. One marquee on the page, this one. */}
      <section aria-label="Platforms issuing ratings in the demo" className="border-y border-[var(--color-border)] py-10">
        <div className="flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
          <div className="flex shrink-0 animate-marquee gap-16 pr-16">
            {[0, 1, 2, 3].flatMap((round) =>
              PLATFORMS.map((name) => (
                <span
                  key={`${round}-${name}`}
                  aria-hidden={round > 0}
                  className="text-[clamp(2rem,4vw,3.5rem)] font-semibold tracking-tighter text-[var(--color-fg-muted)]"
                >
                  {name}
                </span>
              )),
            )}
          </div>
        </div>
      </section>

      {/* Interest: four cells, 3 columns. Row 1 = A(2) + B(1), row 2 = C(1) + D(1) + B. */}
      <section className="mx-auto max-w-6xl px-4 py-32 md:px-8 md:py-48">
        <h2 className="max-w-4xl text-[clamp(2.25rem,4vw,3.75rem)] font-semibold leading-[1.05] tracking-tighter">
          Built so no platform has to trust another.
        </h2>
        <div className="mt-16 grid grid-flow-dense gap-4 md:grid-cols-3 md:grid-rows-2">
          <article className="group relative min-h-80 overflow-hidden rounded-[28px] border border-[var(--color-border)] md:col-span-2">
            <img
              src="https://picsum.photos/seed/workledger-signed-job/1400/800"
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover opacity-50 contrast-125 grayscale transition-transform duration-700 ease-out group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)]/60 to-transparent" />
            <div className="relative flex h-full flex-col justify-end p-6 md:p-10">
              <h3 className="text-2xl font-semibold tracking-tight md:text-3xl">Vouched for by the platform</h3>
              <p className="mt-2 max-w-[48ch] text-[var(--color-fg-muted)]">
                A rating counts only when the platform that ran the job signs for it. A job that
                never happened has nothing to sign.
              </p>
            </div>
          </article>

          <article className="group relative min-h-96 overflow-hidden rounded-[28px] border border-[var(--color-border)] md:row-span-2">
            <img
              src="https://picsum.photos/seed/workledger-phone-scan/800/1400"
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover opacity-55 contrast-125 grayscale transition-transform duration-700 ease-out group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)]/50 to-transparent" />
            <div className="relative flex h-full flex-col justify-end p-6 md:p-8">
              <h3 className="text-2xl font-semibold tracking-tight">Checked without an account</h3>
              <p className="mt-2 text-[var(--color-fg-muted)]">
                Open a link or scan a code. No sign-up, no app, nothing to install.
              </p>
            </div>
          </article>

          <article className="flex min-h-64 flex-col justify-end rounded-[28px] border border-[var(--color-border)] bg-[radial-gradient(circle_at_20%_0%,rgb(143_227_184/0.22),transparent_60%),var(--color-surface)] p-6 md:p-8">
            <h3 className="text-2xl font-semibold tracking-tight">Owned by nobody</h3>
            <p className="mt-2 text-[var(--color-fg-muted)]">
              The record sits on a public network. No platform can edit it or take it down.
            </p>
          </article>

          <article className="flex min-h-64 flex-col justify-between rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 md:p-8">
            <p className="tabular text-6xl font-semibold tracking-tighter text-[var(--color-accent)]">3.00</p>
            <div>
              <h3 className="text-2xl font-semibold tracking-tight">Hard to game</h3>
              <p className="mt-2 text-[var(--color-fg-muted)]">
                Every profile starts here. One perfect job reads as unproven, not flawless.
              </p>
            </div>
          </article>
        </div>
      </section>

      {/* Desire, part one: the pinned walk-through. */}
      <HowItWorks />

      {/* Desire, part two: the two demo profiles, stacked for comparison. */}
      <section id="profiles" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-32 md:px-8 md:py-48">
        <h2 className="max-w-4xl text-[clamp(2.25rem,4vw,3.75rem)] font-semibold leading-[1.05] tracking-tighter">
          A score means little without its count.
        </h2>
        <p className="mt-6 max-w-[52ch] text-lg text-[var(--color-fg-muted)]">
          Both demo workers have a score. Open each one and look at how much evidence stands
          behind it.
        </p>
        <div className="mt-16">
          <ProfileStack profiles={DEMO_PROFILES} />
        </div>
      </section>

      {comments.length === 0 ? null : (
        <section className="mx-auto max-w-6xl px-4 py-32 md:px-8 md:py-48">
          <p className="text-sm uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Demo data</p>
          <h2 className="mt-4 max-w-4xl text-[clamp(2.25rem,4vw,3.75rem)] font-semibold leading-[1.05] tracking-tighter">
            What clients wrote.
          </h2>
          <p className="mt-6 max-w-[56ch] text-lg text-[var(--color-fg-muted)]">
            Straight from the seeded record behind the demo profiles. The people are fictional;
            the ratings are on the test network.
          </p>
          <div className="mt-16">
            <RatingCarousel ratings={comments} />
          </div>
        </section>
      )}

      {/* The limits, stated plainly. Slices widen on hover or focus. */}
      <section className="mx-auto max-w-6xl px-4 py-32 md:px-8 md:py-48">
        <h2 className="max-w-4xl text-[clamp(2.25rem,4vw,3.75rem)] font-semibold leading-[1.05] tracking-tighter">
          What this does not solve.
        </h2>
        <ul className="mt-16 flex flex-col gap-3 md:h-[28rem] md:flex-row">
          {LIMITS.map((limit, index) => (
            <li
              key={limit.title}
              tabIndex={0}
              className="focus-ring group relative flex min-h-48 flex-col justify-end overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 transition-[flex-grow] duration-500 ease-out md:min-h-0 md:flex-1 md:hover:flex-[2.4] md:focus-within:flex-[2.4] md:focus:flex-[2.4]"
            >
              <img
                src={`https://picsum.photos/seed/workledger-limit-${index}/900/900`}
                alt=""
                loading="lazy"
                className="absolute inset-0 size-full object-cover opacity-0 grayscale transition-opacity duration-500 md:group-hover:opacity-25 md:group-focus:opacity-25"
              />
              <div className="relative">
                <h3 className="text-xl font-semibold tracking-tight md:text-2xl">{limit.title}</h3>
                <p className="mt-3 max-w-[36ch] text-[var(--color-fg-muted)] transition-opacity duration-500 md:opacity-0 md:group-hover:opacity-100 md:group-focus:opacity-100">
                  {limit.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Action. */}
      <section className="px-4 pb-24 md:px-8 md:pb-32">
        <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-[40px] bg-[var(--color-accent)] px-6 py-24 text-center text-[var(--color-on-accent)] md:py-36">
          <h2 className="mx-auto max-w-4xl text-[clamp(2.5rem,6vw,5.5rem)] font-semibold leading-[0.98] tracking-tighter">
            Your next platform should know your last one.
          </h2>
          <Link
            href="/dashboard"
            className="btn mt-12 bg-[var(--color-bg)] text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]"
          >
            Sign in with Google
          </Link>
        </div>
      </section>
    </main>
  )
}
