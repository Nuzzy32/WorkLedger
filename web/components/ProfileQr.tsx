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
      color: { dark: '#1C1917', light: '#FFFFFF' },
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
    <section className="rounded-lg border border-[var(--color-border)] bg-surface p-4 md:p-6">
      <h2 className="text-lg font-semibold leading-7">Share this profile</h2>
      {svg === null ? null : (
        <>
          <p className="mt-1 text-[13px] leading-5 text-[var(--color-fg-muted)]">
            Scanning this opens the same page.
          </p>
          <div
            className="mt-4 w-40"
            role="img"
            aria-label="QR code linking to this profile"
            // The SVG is generated from a URL this server built, not from user
            // input, and the test above asserts it carries no script element.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </>
      )}
      <p className="mt-4 break-all font-mono text-[13px] leading-5">{url}</p>
    </section>
  )
}
