import { strict as assert } from 'node:assert'
import { createElement } from 'react'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AddressDisplay } from '../components/AddressDisplay.tsx'
import { PlatformChip } from '../components/PlatformChip.tsx'

test('an active platform shows its name', () => {
  const html = renderToStaticMarkup(
    createElement(PlatformChip, { platform: { id: 1, name: 'SwiftDeliver', active: true } }),
  )

  assert.match(html, /SwiftDeliver/)
  assert.equal(html.includes('No longer issuing'), false)
})

test('an inactive platform says so in words, not only in colour', () => {
  const html = renderToStaticMarkup(
    createElement(PlatformChip, { platform: { id: 2, name: 'GigHub', active: false } }),
  )

  assert.match(html, /GigHub/)
  assert.match(html, /No longer issuing/)
})

test('a platform with no cached name falls back to its id', () => {
  const html = renderToStaticMarkup(
    createElement(PlatformChip, { platform: { id: 7, name: null, active: true } }),
  )

  assert.match(html, /Platform 7/)
})

test('the address is truncated in the middle and kept in full for copying', () => {
  const address = '0xC0895fa97828c38109b25C4CBb060Bf7B05CBb5B'
  const html = renderToStaticMarkup(createElement(AddressDisplay, { address, explorerUrl: null }))

  assert.match(html, /0xC0895f/)
  assert.match(html, /CBb5B/)
  assert.match(html, new RegExp(`data-address="${address}"`))
  assert.equal(html.includes('href='), false)
})

test('an explorer link appears only when there is an explorer', () => {
  const address = '0xC0895fa97828c38109b25C4CBb060Bf7B05CBb5B'
  const html = renderToStaticMarkup(
    createElement(AddressDisplay, { address, explorerUrl: `https://sepolia.basescan.org/address/${address}` }),
  )

  assert.match(html, /href="https:\/\/sepolia\.basescan\.org\/address\//)
})
