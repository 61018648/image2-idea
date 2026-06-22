import type { Metadata, Viewport } from 'next'
import 'streamdown/styles.css'
import 'katex/dist/katex.min.css'
import '../src/index.css'

export const metadata: Metadata = {
  title: 'Image Idea',
  appleWebApp: {
    title: 'Image Idea',
    capable: true,
  },
  manifest: '/manifest.webmanifest',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#111827',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
