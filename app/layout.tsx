import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'ericblo',
  // The icon, Apple touch icon and link-preview image are the files
  // app/icon.png, app/apple-icon.png and app/opengraph-image.png.
  metadataBase: new URL('https://www.ericblo.com'),
  openGraph: {
    title: 'Eric Blohm',
    url: '/',
    siteName: 'ericblo',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
}

// Paint the whole page dark, including the areas phone browsers show behind
// their toolbars, which take their colour from the page background.
export const viewport: Viewport = {
  themeColor: '#04060a',
  colorScheme: 'dark',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-[#04060a]">
      <body className="bg-[#04060a] font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
