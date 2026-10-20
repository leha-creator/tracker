import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import { STATIC_HEX } from '@/components/design-system/token-catalog';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { Toaster } from '@/components/ui/sonner';

import './globals.css';

const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin', 'cyrillic'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin', 'cyrillic'],
});

export const metadata: Metadata = {
  title: 'Tasker',
  description: 'Простой таск-трекер с рабочими пространствами и канбан-доской',
  applicationName: 'Tasker',
};

// Цвет панели браузера на мобильных — фон страницы в своей теме (--background).
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: STATIC_HEX.background },
    { media: '(prefers-color-scheme: dark)', color: STATIC_HEX.backgroundDark },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
