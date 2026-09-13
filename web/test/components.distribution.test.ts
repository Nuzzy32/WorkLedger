import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { RatingDistribution } from '../components/RatingDistribution.tsx'

test('lists five rows, highest score first', () => {
  const html = renderToStaticMarkup(RatingDistribution({ distribution: [1, 0, 1, 1, 9] }))
  const rows = html.match(/data-score="\d"/g)

  assert.deepEqual(rows, [
    'data-score="5"',
    'data-score="4"',
    'data-score="3"',
    'data-score="2"',
    'data-score="1"',
  ])
})

test('carries the count as text, not only as bar width', () => {
  const html = renderToStaticMarkup(RatingDistribution({ distribution: [1, 0, 1, 1, 9] }))

  assert.match(html, /data-score="5"[\s\S]*?>9</)
  assert.match(html, /data-score="2"[\s\S]*?>0</)
})

test('scales bars against the largest bucket, not the total', () => {
  const html = renderToStaticMarkup(RatingDistribution({ distribution: [0, 0, 0, 2, 4] }))

  assert.match(html, /width:\s*100%/)
  assert.match(html, /width:\s*50%/)
})

test('renders an explanation instead of five empty bars', () => {
  const html = renderToStaticMarkup(RatingDistribution({ distribution: [0, 0, 0, 0, 0] }))

  assert.match(html, /No ratings to show/)
  assert.equal(html.includes('data-score='), false)
})

test('says the spread failed to load rather than showing it as empty', () => {
  const html = renderToStaticMarkup(
    RatingDistribution({ distribution: [0, 0, 0, 0, 0], databaseError: true }),
  )

  // A failed read and a worker with no ratings must not render alike.
  assert.match(html, /could not be loaded/)
  assert.match(html, /says nothing about the worker/)
  assert.equal(html.includes('No ratings to show'), false)
  assert.equal(html.includes('data-score='), false)
})
