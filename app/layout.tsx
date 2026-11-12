import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'ericblo',
  description: 'Data Analytics & Strategy',
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
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
