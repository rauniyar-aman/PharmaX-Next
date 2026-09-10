import type { Metadata } from 'next'
import { Inter, Outfit } from 'next/font/google'
import './globals.css'
import Providers from './providers'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
// Outfit — the brand wordmark/display face (Swasthaya Brand Guidelines: "Outfit Bold").
const outfit = Outfit({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-outfit' })

export const metadata: Metadata = {
  title: { default: 'Swasthaya', template: '%s | Swasthaya' },
  description: 'Healthcare, Simplified.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
    ],
    apple: '/favicon-180.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`} suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
      </head>
      <body className="min-h-screen" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
