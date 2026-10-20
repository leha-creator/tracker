import type { MetadataRoute } from 'next';

import { STATIC_HEX } from '@/components/design-system/token-catalog';

/** Манифест веб-приложения (/manifest.webmanifest): имя, цвета и иконки для установки на устройство. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tasker',
    short_name: 'Tasker',
    description: 'Простой таск-трекер с рабочими пространствами и канбан-доской',
    start_url: '/',
    display: 'standalone',
    lang: 'ru',
    background_color: STATIC_HEX.background,
    theme_color: STATIC_HEX.background,
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
