'use client';

import { ExternalLinkIcon, Maximize2Icon, Minimize2Icon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Картинка: «Вписать» (по умолчанию) или «100%» с прокруткой; оригинал — в новой вкладке. */
export function ImageViewer({ src, alt }: { src: string; alt: string }) {
  const [actual, setActual] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        Не удалось показать изображение.{' '}
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline"
        >
          Открыть в новой вкладке
        </a>
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setActual((value) => !value)}
          aria-pressed={actual}
        >
          {actual ? <Minimize2Icon aria-hidden /> : <Maximize2Icon aria-hidden />}
          {actual ? 'Вписать' : '100%'}
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={src} target="_blank" rel="noopener noreferrer">
            <ExternalLinkIcon aria-hidden />
            Оригинал
          </a>
        </Button>
      </div>
      <div
        className={cn(
          'grid rounded-lg border bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:20px_20px] p-2',
          actual ? 'max-h-[80dvh] overflow-auto' : 'place-items-center',
        )}
      >
        {/* Картинка из хранилища через проверку доступа: next/image здесь не нужен. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
          className={cn(actual ? 'max-w-none' : 'max-h-[75dvh] max-w-full object-contain')}
        />
      </div>
    </div>
  );
}
