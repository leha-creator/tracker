'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/**
 * QR-код для приложения-аутентификатора. Рисуется в браузере: URI с секретом не уходит
 * ни в логи, ни в сторонние сервисы.
 */
export function TotpQrCode({ uri }: { uri: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((markup) => {
        if (!cancelled) setSvg(markup);
      })
      .catch(() => {
        if (!cancelled) setSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (!svg) {
    return <div aria-hidden className="size-44 animate-pulse rounded-md bg-muted" />;
  }
  return (
    <div
      role="img"
      aria-label="QR-код для приложения-аутентификатора"
      // Белый фон в любой теме: тёмный QR на тёмном фоне не сканируется.
      className="size-44 rounded-md bg-white p-2 [&>svg]:size-full"
      // SVG сгенерирован библиотекой qrcode из нашего URI, пользовательского HTML в нём нет.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
