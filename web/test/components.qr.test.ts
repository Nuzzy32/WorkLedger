import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfileQr, profileQrSvg } from '../components/ProfileQr.tsx'

test('renders an svg carrying the profile url', async () => {
  const svg = await profileQrSvg('http://localhost:3000/w/0xC0895fa9')

  assert.ok(svg !== null)
  assert.match(svg, /^<svg/)
  assert.match(svg, /<\/svg>$/)
  assert.equal(svg.includes('<script'), false)
})

// Longer than any QR code can hold, so the generator rejects for real rather
// than through a stub.
const tooLong = `http://localhost:3000/w/${'a'.repeat(3000)}`

test('returns null instead of throwing when the code cannot be generated', async () => {
  assert.equal(await profileQrSvg(tooLong), null)
})

test('falls back to the url in text, and takes nothing else down with it', async () => {
  const html = renderToStaticMarkup(await ProfileQr({ url: tooLong }))

  assert.match(html, /Share this profile/)
  assert.match(html, new RegExp(tooLong))
  assert.equal(html.includes('<svg'), false)
  assert.equal(html.includes('Scanning this'), false)
})

test('encodes different urls differently', async () => {
  const first = await profileQrSvg('http://localhost:3000/w/0x1111')
  const second = await profileQrSvg('http://localhost:3000/w/0x2222')

  assert.notEqual(first, second)
})
