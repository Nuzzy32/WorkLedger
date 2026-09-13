import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ScoreBadge } from '../components/ScoreBadge.tsx'
import { VerificationResult } from '../components/VerificationResult.tsx'

test('a verified badge shows the score, the count, and the label', () => {
  const html = renderToStaticMarkup(
    ScoreBadge({ scoreBps: 43200, ratingCount: 40, state: 'verified', neutralRing: false }),
  )

  assert.match(html, /4\.32/)
  assert.match(html, /40 ratings/)
  assert.match(html, /Verified/)
  assert.match(html, /tabular/)
})

test('an unproven badge says so and explains the sample', () => {
  const html = renderToStaticMarkup(
    ScoreBadge({ scoreBps: 46000, ratingCount: 2, state: 'unproven', neutralRing: false }),
  )

  assert.match(html, /Unproven/)
  assert.match(html, /2 ratings/)
})

test('a single rating is not pluralised', () => {
  const html = renderToStaticMarkup(
    ScoreBadge({ scoreBps: 50000, ratingCount: 1, state: 'unproven', neutralRing: false }),
  )

  assert.match(html, /1 rating[^s]/)
})

test('a deactivated issuer replaces the label with a footnote', () => {
  const html = renderToStaticMarkup(
    ScoreBadge({ scoreBps: 43200, ratingCount: 40, state: 'verified', neutralRing: true }),
  )

  assert.match(html, /no longer issues ratings/)
})

test('the partial badge reports a last known value, not a verdict', () => {
  const html = renderToStaticMarkup(
    ScoreBadge({ scoreBps: 37600, ratingCount: 16, state: 'partial', neutralRing: false }),
  )

  // Verified and unproven are judgements about a history the page could not
  // read. It may only say what it has: the value it saved last time.
  assert.match(html, /Last known/)
  assert.equal(html.includes('Verified'), false)
  assert.equal(html.includes('Unproven'), false)
  assert.match(html, /aria-label="Last known"/)
  assert.match(html, /border-\[var\(--color-border\)\]/)
})

test('a small sample is still called small under a deactivated issuer', () => {
  const html = renderToStaticMarkup(
    ScoreBadge({ scoreBps: 50000, ratingCount: 4, state: 'unproven', neutralRing: true }),
  )

  // Two different questions: who issued these, and how many are there.
  assert.match(html, /no longer issues ratings/)
  assert.match(html, /Too small a sample/)
})

test('a partial hero with no cached score shows no score anywhere', () => {
  const html = renderToStaticMarkup(
    VerificationResult({
      state: 'partial',
      neutralRing: false,
      scoreBps: null,
      ratingCount: 0,
      displayName: 'Rani Wibowo',
      headline: null,
      cachedAt: '2026-09-11T02:00:00.000Z',
    }),
  )

  // workers.cached_score is nullable. A 0.00 would read as an accusation.
  assert.equal(/\d\.\d\d/.test(html), false)
  assert.match(html, /No score to show/)
  assert.match(html, /Showing the last known value/)
})

test('the not-found hero shows no score at all', () => {
  const html = renderToStaticMarkup(
    VerificationResult({
      state: 'not-found',
      neutralRing: false,
      scoreBps: 30000,
      ratingCount: 0,
      displayName: null,
      headline: null,
      cachedAt: null,
    }),
  )

  // The prior baseline must never surface as a score for an unknown address.
  assert.equal(html.includes('3.00'), false)
  assert.match(html, /No record/)
})

test('the empty hero explains where ratings come from', () => {
  const html = renderToStaticMarkup(
    VerificationResult({
      state: 'empty',
      neutralRing: false,
      scoreBps: 30000,
      ratingCount: 0,
      displayName: 'Rani Wibowo',
      headline: null,
      cachedAt: null,
    }),
  )

  assert.equal(html.includes('3.00'), false)
  assert.match(html, /No ratings yet/)
})

test('the partial hero marks the value as cached', () => {
  const html = renderToStaticMarkup(
    VerificationResult({
      state: 'partial',
      neutralRing: false,
      scoreBps: 43200,
      ratingCount: 12,
      displayName: 'Rani Wibowo',
      headline: 'Courier',
      cachedAt: '2026-09-11T02:00:00.000Z',
    }),
  )

  assert.match(html, /Showing the last known value/)
})

test('a verified hero carries the last updated timestamp', () => {
  const html = renderToStaticMarkup(
    VerificationResult({
      state: 'verified',
      neutralRing: false,
      scoreBps: 43200,
      ratingCount: 40,
      displayName: 'Rani Wibowo',
      headline: null,
      cachedAt: '2026-09-11T02:00:00.000Z',
    }),
  )

  assert.match(html, /Last updated/)
  assert.equal(html.includes('Showing the last known value'), false)
})

test('every state carries a text label beside its colour', () => {
  for (const state of ['verified', 'unproven', 'empty', 'not-found', 'partial'] as const) {
    const html = renderToStaticMarkup(
      VerificationResult({
        state,
        neutralRing: false,
        scoreBps: 43200,
        ratingCount: 12,
        displayName: 'Rani Wibowo',
        headline: null,
        cachedAt: null,
      }),
    )
    assert.match(html, /aria-label=/, `${state} needs an aria-label on its icon`)
  }
})
