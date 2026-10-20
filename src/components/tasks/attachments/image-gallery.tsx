'use client';

import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { ImageViewer } from '@/components/documents/viewers/image-viewer';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatFileSize } from '@/modules/tasks/client';

import { pickGalleryImages, stepGalleryImage, type GalleryAttachment } from './gallery-images';

const ImageGalleryContext = createContext<((id: string) => void) | null>(null);

/** Открыть картинку списка в модальном просмотре; `null` — вне `ImageGallery`. */
export function useImageGallery() {
  return useContext(ImageGalleryContext);
}

/**
 * Просмотр картинок списка вложений в модальном окне на этой же странице:
 * переход между картинками кнопками и стрелками ←/→, скачивание, оригинал в новой вкладке.
 */
export function ImageGallery({
  attachments,
  children,
}: {
  /** Все вложения списка; в просмотр попадают только картинки (`previewHref`). */
  attachments: GalleryAttachment[];
  children: ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const images = useMemo(() => pickGalleryImages(attachments), [attachments]);
  const index = openId === null ? -1 : images.findIndex((image) => image.id === openId);
  const image = images[index] ?? null;
  const hasSiblings = images.length > 1;

  const step = useCallback(
    (delta: number) => {
      const next = openId === null ? null : stepGalleryImage(images, openId, delta);
      if (next) setOpenId(next.id);
    },
    [images, openId],
  );

  return (
    <ImageGalleryContext.Provider value={setOpenId}>
      {children}
      <Dialog open={image !== null} onOpenChange={(next) => !next && setOpenId(null)}>
        {image && (
          <DialogContent
            className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-5xl"
            onKeyDown={(event) => {
              if (!hasSiblings) return;
              if (event.key === 'ArrowLeft') step(-1);
              else if (event.key === 'ArrowRight') step(1);
              else return;
              event.preventDefault();
            }}
          >
            <DialogHeader className="min-w-0 pr-8">
              <DialogTitle className="truncate" title={image.fileName}>
                {image.fileName}
              </DialogTitle>
              <DialogDescription>
                {formatFileSize(image.size)}
                {hasSiblings && ` · ${index + 1} из ${images.length}`}
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 overflow-auto">
              {/* key — сброс масштаба и ошибки загрузки при смене картинки. */}
              <ImageViewer key={image.id} src={image.previewHref} alt={image.fileName} />
            </div>
            <DialogFooter className="sm:justify-between">
              {hasSiblings ? (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => step(-1)}>
                    <ChevronLeftIcon aria-hidden />
                    Предыдущая
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => step(1)}>
                    Следующая
                    <ChevronRightIcon aria-hidden />
                  </Button>
                </div>
              ) : (
                <span />
              )}
              <Button asChild variant="outline" size="sm">
                <a href={image.href} download={image.fileName}>
                  <DownloadIcon aria-hidden />
                  Скачать
                </a>
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ImageGalleryContext.Provider>
  );
}
