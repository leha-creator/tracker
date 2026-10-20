import type { TaskAttachmentDto } from '@/modules/tasks/client';

export type GalleryAttachment = Pick<
  TaskAttachmentDto,
  'id' | 'fileName' | 'size' | 'href' | 'previewHref'
>;

export type GalleryImage = GalleryAttachment & { previewHref: string };

/** Картинки списка вложений (есть `previewHref`) в исходном порядке. */
export function pickGalleryImages(attachments: GalleryAttachment[]): GalleryImage[] {
  return attachments.flatMap(({ previewHref, ...rest }) =>
    previewHref === null ? [] : [{ ...rest, previewHref }],
  );
}

/** Соседняя картинка по кругу: `delta` −1 — предыдущая, 1 — следующая; `null`, если текущей нет. */
export function stepGalleryImage(
  images: GalleryImage[],
  currentId: string,
  delta: number,
): GalleryImage | null {
  const index = images.findIndex((image) => image.id === currentId);
  if (index < 0) return null;
  return images[(((index + delta) % images.length) + images.length) % images.length] ?? null;
}
