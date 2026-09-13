import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { profileQrSvg } from '../components/ProfileQr.tsx'

test('renders an svg carrying the profile url', async () => {
  const svg = await profileQrSvg('http://localhost:3000/w/0xC0895fa9')

  assert.match(svg, /^<svg/)
  assert.match(svg, /<\/svg>$/)
  assert.equal(svg.includes('<script'), false)
})

test('encodes different urls differently', async () => {
  const first = await profileQrSvg('http://localhost:3000/w/0x1111')
  const second = await profileQrSvg('http://localhost:3000/w/0x2222')

  assert.notEqual(first, second)
})
