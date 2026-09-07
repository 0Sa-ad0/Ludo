import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ludo — Neon Edition',
  description: 'Multiplayer Ludo game with neon dark theme. Play with 2–6 players on the same WiFi or anywhere via shared link.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Pinch-zoom stays enabled: locking it out is an accessibility failure
  // (WCAG 1.4.4), and on a dense board people genuinely need to zoom in.
  maximumScale: 5,
  userScalable: true,
  themeColor: '#0d0d1a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
