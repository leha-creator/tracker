import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { STATIC_HEX } from '@/components/design-system/token-catalog';

import { MARK_CHECK, MARK_TILE } from './mark-geometry';

const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

const COLOR_FILES = ['public/brand/logo-mark.svg', 'public/brand/logo.svg', 'src/app/icon.svg'];
const ALL_FILES = [...COLOR_FILES, 'public/brand/logo-mark-mono.svg'];

describe('файлы знака', () => {
  it.each(ALL_FILES)('%s повторяет геометрию LogoMark', (path) => {
    const svg = read(path);
    expect(svg).toContain(`d="${MARK_CHECK.d}"`);
    expect(svg).toContain(`stroke-width="${MARK_CHECK.strokeWidth}"`);
    expect(svg).toContain(`rx="${MARK_TILE.radius}"`);
  });

  it.each(COLOR_FILES)('%s окрашен цветом бренда', (path) => {
    expect(read(path)).toContain(STATIC_HEX.brand);
  });

  it('иконка вкладки в тёмной теме — цвет акцента тёмной темы', () => {
    expect(read('src/app/icon.svg')).toContain(STATIC_HEX.brandDark);
  });
});
