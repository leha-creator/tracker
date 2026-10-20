import { describe, expect, it } from 'vitest';

import { pickGalleryImages, stepGalleryImage, type GalleryAttachment } from './gallery-images';

function attachment(id: string, previewable: boolean): GalleryAttachment {
  return {
    id,
    fileName: `${id}.bin`,
    size: 1,
    href: `/api/attachments/${id}`,
    previewHref: previewable ? `/api/attachments/${id}?inline=1` : null,
  };
}

describe('pickGalleryImages', () => {
  it('оставляет только картинки в исходном порядке', () => {
    const images = pickGalleryImages([
      attachment('a', true),
      attachment('doc', false),
      attachment('b', true),
    ]);
    expect(images.map((image) => image.id)).toEqual(['a', 'b']);
    expect(images[0]?.previewHref).toBe('/api/attachments/a?inline=1');
  });

  it('пустой список, если картинок нет', () => {
    expect(pickGalleryImages([attachment('doc', false)])).toEqual([]);
  });
});

describe('stepGalleryImage', () => {
  const images = pickGalleryImages(['a', 'b', 'c'].map((id) => attachment(id, true)));

  it('переходит к следующей и предыдущей', () => {
    expect(stepGalleryImage(images, 'a', 1)?.id).toBe('b');
    expect(stepGalleryImage(images, 'b', -1)?.id).toBe('a');
  });

  it('идёт по кругу с обоих концов', () => {
    expect(stepGalleryImage(images, 'c', 1)?.id).toBe('a');
    expect(stepGalleryImage(images, 'a', -1)?.id).toBe('c');
  });

  it('одна картинка остаётся собой', () => {
    expect(stepGalleryImage(images.slice(0, 1), 'a', 1)?.id).toBe('a');
  });

  it('null, если текущей картинки нет в списке', () => {
    expect(stepGalleryImage(images, 'missing', 1)).toBeNull();
    expect(stepGalleryImage([], 'a', 1)).toBeNull();
  });
});
