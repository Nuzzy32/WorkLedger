import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { SiteFooter } from '../components/SiteFooter.tsx'
import { SiteNav } from '../components/SiteNav.tsx'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' })

export const metadata: Metadata = {
  title: 'WorkLedger',
  description: 'Portable work reputation, verifiable by anyone.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="grain">
        <SiteNav />
        {/* overflow-x-hidden: off-screen animation starts must never widen the page. */}
        <div className="w-full max-w-full overflow-x-hidden">{children}</div>
        <SiteFooter />
      </body>
    </html>
  )
}
