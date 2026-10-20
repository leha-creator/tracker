import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { MAIL_COLORS } from '@/shared/mail/mail-layout';

import { COLOR_TOKENS, STATIC_HEX } from './token-catalog';

const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');

/** Тело первого блока `selector { ... }` верхнего уровня (без вложенных фигурных скобок). */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`Нет блока ${selector}`);
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('\n}', open));
}

/** Объявленные переменные блока: имя без `--` → значение. */
function declarations(body: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of body.matchAll(/^\s*--([\w-]+):\s*([^;]+);/gm)) {
    const [, name = '', value = ''] = match;
    result.set(name, value.trim());
  }
  return result;
}

/** oklch(L C h) → #rrggbb (sRGB, с обрезкой гаммы). */
function oklchToHex(value: string): string {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value);
  if (!match) throw new Error(`Не oklch: ${value}`);
  const [L = 0, C = 0, h = 0] = match.slice(1).map(Number);
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${linear
    .map((channel) => {
      const x = Math.min(1, Math.max(0, channel));
      const srgb = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
      return Math.round(srgb * 255)
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;
}

const light = declarations(block(':root'));
const dark = declarations(block('.dark'));
const theme = declarations(block('@theme inline'));

describe('каталог токенов', () => {
  it.each(COLOR_TOKENS.map((token) => [token.name, token]))(
    '--%s объявлен в globals.css',
    (_, token) => {
      expect(light.has(token.name)).toBe(true);
      expect(dark.has(token.name)).toBe(token.themed);
      expect(theme.has(`color-${token.name}`) || token.name === 'brand').toBe(true);
    },
  );

  it('каждый --color-* в @theme inline ссылается на объявленную переменную', () => {
    for (const [name, value] of theme) {
      const ref = /^var\(--([\w-]+)\)$/.exec(value)?.[1];
      if (!name.startsWith('color-') || !ref) continue;
      expect(light.has(ref), `--${name} → --${ref}`).toBe(true);
    }
  });

  it('в globals.css нет цветовых токенов вне каталога', () => {
    const known = new Set(COLOR_TOKENS.map((token) => token.name));
    const colorLike = /^(brand|success|warning|info|tone-)/;
    const unknown = [...light.keys(), ...dark.keys()].filter(
      (name) => colorLike.test(name) && !known.has(name),
    );
    expect(unknown).toEqual([]);
  });

  it('HEX-копии совпадают с токенами', () => {
    expect(oklchToHex(light.get('brand')!)).toBe(STATIC_HEX.brand);
    expect(oklchToHex(dark.get('primary')!)).toBe(STATIC_HEX.brandDark);
    expect(oklchToHex(light.get('background')!)).toBe(STATIC_HEX.background);
    expect(oklchToHex(dark.get('background')!)).toBe(STATIC_HEX.backgroundDark);
    expect(oklchToHex(light.get('foreground')!)).toBe(STATIC_HEX.foreground);
    expect(oklchToHex(light.get('muted-foreground')!)).toBe(STATIC_HEX.mutedForeground);
    expect(oklchToHex(light.get('border')!)).toBe(STATIC_HEX.border);
  });

  it('бренд совпадает со светлым акцентом', () => {
    expect(light.get('brand')).toBe(light.get('primary'));
  });
});

describe('цвета писем', () => {
  it('MAIL_COLORS — копии STATIC_HEX', () => {
    expect(MAIL_COLORS).toEqual({
      brand: STATIC_HEX.brand,
      text: STATIC_HEX.foreground,
      muted: STATIC_HEX.mutedForeground,
      border: STATIC_HEX.border,
      background: STATIC_HEX.background,
    });
  });
});
