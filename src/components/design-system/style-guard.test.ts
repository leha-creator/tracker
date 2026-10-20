import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../..', import.meta.url));

/** Каталоги, которые не проверяются: shadcn генерирует ui/, Prisma — generated/. */
const SKIPPED_DIRS = ['components/ui', 'generated'];

/**
 * Файлы, которым разрешены сырые цвета. Каждое исключение — с причиной;
 * новое добавляйте, только если цвет не выражается токеном (см. docs/design.md).
 */
const ALLOWED_FILES: Record<string, string> = {
  'components/entity-icon/entity-icon.tsx':
    'декоративная палитра плиток пространств и проектов, выбирается пользователем',
};

const PALETTE =
  'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone';

const RULES: { name: string; pattern: RegExp }[] = [
  {
    name: 'цвет палитры Tailwind — используйте токен или тон (tones.ts)',
    pattern: new RegExp(
      `\\b(?:text|bg|border|ring|fill|stroke|from|to|via|outline|decoration|divide|shadow)-(?:${PALETTE})-\\d{2,3}\\b`,
    ),
  },
  { name: 'произвольный цвет в классе — заведите токен', pattern: /\[(?:oklch|rgb|hsl)\(/ },
  { name: 'HEX в классе — заведите токен', pattern: /\[#[0-9a-fA-F]{3,8}\]/ },
  { name: 'размер 11px — используйте text-2xs', pattern: /text-\[(?:0\.6875rem|11px)\]/ },
  {
    name: 'HEX в inline style — используйте var(--токен)',
    pattern: /style=\{\{[^}]*['"]#[0-9a-fA-F]{3,8}['"]/,
  },
];

function listTsx(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    const rel = relative(SRC, path).split(sep).join('/');
    if (entry.isDirectory()) return SKIPPED_DIRS.includes(rel) ? [] : listTsx(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

describe('style guard', () => {
  const files = listTsx(SRC);

  it('находит компоненты для проверки', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('в src/**/*.tsx нет сырых цветов и произвольных размеров вне токенов', () => {
    const violations: string[] = [];
    for (const file of files) {
      const rel = relative(SRC, file).split(sep).join('/');
      if (rel in ALLOWED_FILES) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          for (const rule of RULES) {
            if (rule.pattern.test(line)) violations.push(`src/${rel}:${index + 1} — ${rule.name}`);
          }
        });
    }
    expect(
      violations,
      'Исключение добавляйте в ALLOWED_FILES только с причиной; правила — docs/design.md',
    ).toEqual([]);
  });

  it('исключения указывают на существующие файлы', () => {
    const relFiles = new Set(files.map((file) => relative(SRC, file).split(sep).join('/')));
    for (const allowed of Object.keys(ALLOWED_FILES)) expect(relFiles).toContain(allowed);
  });
});
