import { strict as assert } from 'node:assert'
import { createElement } from 'react'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { RatingList } from '../components/RatingList.tsx'
import type { RatingView } from '../lib/db.ts'

const rating: RatingView = {
  jobId: `0x${'11'.repeat(32)}`,
  score: 5,
  comment: 'Arrived early and repacked a torn box.',
  jobTitle: 'Same-day delivery',
  platformId: 1,
  platformName: 'SwiftDeliver',
  platformActive: true,
  submittedAt: '2026-09-04T09:30:00.000Z',
  txHash: `0x${'ab'.repeat(32)}`,
}

test('shows the job, the platform, the score, and the comment', () => {
  const html = renderToStaticMarkup(
    createElement(RatingList, { ratings: [rating], totalCount: 1, explorerTxUrl: () => null }),
  )

  assert.match(html, /Same-day delivery/)
  assert.match(html, /SwiftDeliver/)
  assert.match(html, /Arrived early/)
  assert.match(html, />5</)
})

test('never renders a client address', () => {
  const html = renderToStaticMarkup(
    createElement(RatingList, { ratings: [rating], totalCount: 1, explorerTxUrl: () => null }),
  )

  assert.equal(/0x[0-9a-fA-F]{40}/.test(html), false)
})

test('says how many ratings the list is showing out of the whole history', () => {
  const html = renderToStaticMarkup(
    createElement(RatingList, { ratings: [rating], totalCount: 40, explorerTxUrl: () => null }),
  )

  assert.match(html, /Showing 1 of 40/)
})

test('renders the transaction hash as text when there is no explorer', () => {
  const html = renderToStaticMarkup(
    createElement(RatingList, { ratings: [rating], totalCount: 1, explorerTxUrl: () => null }),
  )

  assert.match(html, /ababab/)
  assert.equal(html.includes('href='), false)
})

test('links the transaction when an explorer exists', () => {
  const html = renderToStaticMarkup(
    createElement(RatingList, {
      ratings: [rating],
      totalCount: 1,
      explorerTxUrl: (txHash) => `https://sepolia.basescan.org/tx/${txHash}`,
    }),
  )

  assert.match(html, /href="https:\/\/sepolia\.basescan\.org\/tx\/0xabab/)
})

test('explains itself when there is nothing to list', () => {
  const html = renderToStaticMarkup(
    createElement(RatingList, { ratings: [], totalCount: 0, explorerTxUrl: () => null }),
  )

  assert.match(html, /No ratings yet/)
})

test('handles a rating with no comment and no job title', () => {
  const bare: RatingView = { ...rating, comment: null, jobTitle: null }
  const html = renderToStaticMarkup(
    createElement(RatingList, { ratings: [bare], totalCount: 1, explorerTxUrl: () => null }),
  )

  assert.match(html, /Untitled job/)
  assert.equal(html.includes('null'), false)
})
