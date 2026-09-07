# Design system

## Direction

The interface has to read as a credentials tool, not as a crypto app. Nobody
checking a courier's history wants neon gradients and a glowing token balance.

Reference points: a bank statement, a lab result, a background check. Dense,
plain, legible. Confidence comes from restraint.

Never show the words blockchain, wallet, gas, or token in the worker or verifier
UI. Put them in the footer and in the developer docs.

## Color

Tailwind v4 CSS variables in `app/globals.css`.

```css
@theme {
  --color-bg:          #FAFAF9;
  --color-surface:     #FFFFFF;
  --color-border:      #E7E5E4;
  --color-fg:          #1C1917;
  --color-fg-muted:    #78716C;

  --color-accent:      #1E40AF;
  --color-accent-weak: #EFF6FF;

  --color-verified:    #15803D;
  --color-caution:     #B45309;
  --color-danger:      #B91C1C;
}
```

Three semantic colors carry meaning and nothing else does:

- **verified** green for a confirmed record
- **caution** amber for an unproven profile, meaning under 10 ratings
- **danger** red for a deactivated platform or a failed check

Amber matters more than it looks. A new account is neither trustworthy nor
suspicious, and the UI has to say so without picking a side.

Never use color alone to carry a state. Pair it with an icon and a label so the
meaning survives a colorblind reviewer and a grayscale screenshot.

## Type

Inter for the interface. JetBrains Mono for addresses, hashes, and transaction
IDs.

```
display   32px / 40   600
h1        24px / 32   600
h2        18px / 28   600
body      15px / 24   400
small     13px / 20   400
mono      13px / 20   400
```

Score numbers render at display size with tabular figures. Without
`font-variant-numeric: tabular-nums` the digits shift width and the number jitters
as it updates.

## Spacing

4px base. Use 4, 8, 12, 16, 24, 32, 48, 64. Nothing else.

Card padding 24px on desktop, 16px on mobile. Section gap 48px.

## Components

### ScoreBadge

The centerpiece. Shows the number, the rating count, and a state.

- Under 10 ratings: amber ring, label "Unproven"
- 10 or more: green ring, label "Verified"
- Deactivated platform in the history: neutral ring, footnote

Never render a bare number. A 5.0 from one job and a 4.7 from three hundred look
identical without the count, and that gap is exactly what the project is about.

### RatingDistribution

Horizontal bars for 1 through 5. Shows shape, which an average hides. A worker
with forty 5s and ten 1s averages the same as one with fifty 4s, and a client
should see the difference.

### PlatformChip

Platform name, small logo, active or inactive state.

### VerificationResult

The verifier page hero. Three states, all designed:

- **Verified.** Green check, score, count, "Last updated" timestamp
- **Not found.** Plain, no alarm. An unknown address is not a fraud signal
- **Unproven.** Amber, score shown, plus a line explaining that the sample is
  small

### AddressDisplay

Truncated middle, monospace, click to copy, link to the block explorer.

## States to design

Every list and every data view needs four. Skipping these is the most common
reason a portfolio project looks unfinished.

- **Loading.** Skeletons matching the final layout, not a spinner
- **Empty.** Explains what would appear here and how to get there
- **Error.** Says what failed and offers a retry
- **Partial.** Cache is stale and the chain read is pending, so show the cached
  value with a subtle indicator rather than blocking the page

## Responsive

Mobile first. A verifier scans a QR code with a phone, so the phone layout is the
primary case, not the fallback.

Breakpoints: `sm` 640, `md` 768, `lg` 1024. Nothing above `lg`.

Cap content at 1120px. Full-width dashboards read as unfinished.

## Accessibility

- 4.5:1 contrast on body text, 3:1 on large text. Check the amber on white, it
  fails easily.
- Every interactive element reaches by keyboard, with a visible focus ring. Never
  set `outline: none` without a replacement.
- Icons carry `aria-label` when they stand alone.
- Score changes announce through a live region.
- Tap targets 44px minimum.

## Motion

Almost none. 150ms on hover and focus, 200ms on page transitions. Respect
`prefers-reduced-motion`.

Animated counters on a score are tempting and wrong. The number is a fact, not a
reveal.
