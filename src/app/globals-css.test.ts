import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');

/** Аргументы всех `:has(...)` с маркером страницы `[data-*]` (без вложенных скобок первого уровня). */
function markerHasSelectors(source: string): string[] {
  const result: string[] = [];
  for (const match of source.matchAll(/:has\(/g)) {
    let depth = 1;
    let i = match.index + ':has('.length;
    const start = i;
    while (i < source.length && depth > 0) {
      if (source[i] === '(') depth += 1;
      if (source[i] === ')') depth -= 1;
      i += 1;
    }
    const argument = source.slice(start, i - 1);
    if (argument.startsWith('[data-')) result.push(argument);
  }
  return result;
}

describe('globals.css', () => {
  it('находит правила вёрстки по маркерам страниц', () => {
    expect(markerHasSelectors(css).length).toBeGreaterThan(0);
  });

  // Next.js (Cache Components) прячет посещённые страницы в <Activity> с инлайн display: none,
  // DOM остаётся. Без фильтра скрытая доска растягивает main на экран на соседних страницах.
  it.each(markerHasSelectors(css))('правило :has(%s) игнорирует скрытые страницы', (selector) => {
    expect(selector).toContain(":not([style*='display: none'], [style*='display: none'] *)");
  });
});
