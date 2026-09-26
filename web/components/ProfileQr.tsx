import QRCode from 'qrcode'

/**
 * QR as an SVG string, generated on the server.
 *
 * No client JavaScript: the code is already markup by the time the page
 * arrives, which matters because the phone scanning it is the primary case.
 */
export async function profileQrSvg(url: string): Promise<string | null> {
  try {
    const svg = await QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0B0B0C', light: '#EDEDEA' },
    })
    return svg.trim()
  } catch {
    // The URL below is the share link; the code is only a faster way to type
    // it. Losing it must not cost the verifier the score, the spread, and the
    // list, so it fails quietly and the page carries on.
    return null
  }
}

export async function ProfileQr({ url }: { url: string }) {
  const svg = await profileQrSvg(url)

  return (
    <section className="panel p-5 md:p-8">
      <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Share this profile</h2>
      {svg === null ? null : (
        <>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Scanning this opens the same page.
          </p>
          <div
            className="mt-6 w-44 overflow-hidden rounded-2xl"
            role="img"
            aria-label="QR code linking to this profile"
            // The SVG is generated from a URL this server built, not from user
            // input, and the test above asserts it carries no script element.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </>
      )}
      <p className="mt-6 break-all font-mono text-sm text-[var(--color-fg-muted)]">{url}</p>
    </section>
  )
}
