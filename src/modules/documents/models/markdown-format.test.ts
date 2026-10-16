import { describe, expect, it } from 'vitest';

import { applyMarkdownFormat, insertMarkdownLink, type FormatResult } from './markdown-format';

/** Текст с выделением в виде `[...]` (или `|` для курсора) → вход для форматирования. */
function parse(marked: string) {
  const cursor = marked.indexOf('|');
  if (cursor !== -1) {
    return { text: marked.replace('|', ''), selection: { start: cursor, end: cursor } };
  }
  const start = marked.indexOf('[');
  const end = marked.indexOf(']') - 1;
  return { text: marked.replace('[', '').replace(']', ''), selection: { start, end } };
}

/** Результат → текст с выделением `[...]`. */
function show({ text, selection }: FormatResult) {
  if (selection.start === selection.end) {
    return `${text.slice(0, selection.start)}|${text.slice(selection.start)}`;
  }
  return `${text.slice(0, selection.start)}[${text.slice(selection.start, selection.end)}]${text.slice(selection.end)}`;
}

function format(marked: string, action: Parameters<typeof applyMarkdownFormat>[2]) {
  const { text, selection } = parse(marked);
  return show(applyMarkdownFormat(text, selection, action));
}

/** Форматирование всего текста (когда в нём есть квадратные скобки). */
function formatAll(text: string, action: Parameters<typeof applyMarkdownFormat>[2]) {
  return applyMarkdownFormat(text, { start: 0, end: text.length }, action).text;
}

describe('inline formatting', () => {
  it('wraps the selection', () => {
    expect(format('a [b] c', 'bold')).toBe('a **[b]** c');
    expect(format('a [b] c', 'italic')).toBe('a _[b]_ c');
    expect(format('a [b] c', 'strike')).toBe('a ~~[b]~~ c');
    expect(format('a [b] c', 'code')).toBe('a `[b]` c');
  });

  it('inserts a selected placeholder for an empty selection', () => {
    expect(format('a |', 'bold')).toBe('a **[жирный текст]**');
  });

  it('unwraps markers around the selection', () => {
    expect(format('a **[b]** c', 'bold')).toBe('a [b] c');
  });

  it('unwraps markers inside the selection', () => {
    expect(format('a [**b**] c', 'bold')).toBe('a [b] c');
  });
});

describe('line formatting', () => {
  it('adds a heading to the current line and keeps the cursor at its end', () => {
    expect(format('Заголо|вок\nтекст', 'heading')).toBe('## Заголовок|\nтекст');
  });

  it('replaces an existing heading level and toggles it off', () => {
    expect(format('### Т|', 'heading')).toBe('## Т|');
    expect(format('## Т|', 'heading')).toBe('Т|');
  });

  it('formats every non-empty selected line', () => {
    expect(format('[a\n\nb]', 'bulletList')).toBe('[- a\n\n- b]');
    expect(format('[a\nb\nc]', 'orderedList')).toBe('[1. a\n2. b\n3. c]');
    expect(format('[a\nb]', 'quote')).toBe('[> a\n> b]');
  });

  it('switches list kinds instead of stacking markers', () => {
    expect(format('[- a\n- b]', 'orderedList')).toBe('[1. a\n2. b]');
    expect(format('[1. a\n2. b]', 'checklist')).toBe('[- [ ] a\n- [ ] b]');
    expect(formatAll('- [x] a', 'bulletList')).toBe('- a');
  });

  it('toggles a list off when all lines have it', () => {
    expect(format('[- a\n- b]', 'bulletList')).toBe('[a\nb]');
    expect(formatAll('- [ ] a\n- [x] b', 'checklist')).toBe('a\nb');
  });

  it('does not take the next line when the selection ends at its start', () => {
    expect(format('[a\n]b', 'quote')).toBe('[> a]\nb');
  });

  it('applies to an empty line under the cursor', () => {
    expect(format('a\n|', 'checklist')).toBe('a\n- [ ] |');
  });
});

describe('block formatting', () => {
  it('fences the selection on separate lines', () => {
    expect(format('x[const a = 1]y', 'codeBlock')).toBe('x\n```\n[const a = 1]\n```\ny');
  });

  it('unfences a fenced selection', () => {
    expect(format('[```ts\nconst a = 1\n```]', 'codeBlock')).toBe('[const a = 1]');
  });

  it('inserts an empty code block at the cursor', () => {
    expect(format('|', 'codeBlock')).toBe('```\n|\n```');
  });

  it('inserts a table after the selection with the first header selected', () => {
    expect(format('text|', 'table')).toBe(
      'text\n| [Колонка 1] | Колонка 2 |\n| --- | --- |\n|  |  |',
    );
  });
});

describe('links', () => {
  it('uses the selection as the label and selects the url placeholder', () => {
    const result = applyMarkdownFormat('see docs', { start: 4, end: 8 }, 'link');
    expect(result.text).toBe('see [docs](https://)');
    expect(result.text.slice(result.selection.start, result.selection.end)).toBe('https://');
  });

  it('turns a selected url into the address', () => {
    const { text, selection } = parse('[https://example.com/a(b)]');
    const result = applyMarkdownFormat(text, selection, 'link');
    expect(result.text).toBe('[ссылка](https://example.com/a%28b%29)');
    expect(result.text.slice(result.selection.start, result.selection.end)).toBe('ссылка');
  });

  it('inserts a document link with its title and puts the cursor after it', () => {
    const result = insertMarkdownLink(
      'См. ',
      { start: 4, end: 4 },
      {
        href: '/w/team/docs/123',
        label: 'Регламент [v2]',
      },
    );
    expect(result.text).toBe('См. [Регламент v2](/w/team/docs/123)');
    expect(result.selection.start).toBe(result.text.length);
  });

  it('keeps the selected text as the document link label', () => {
    const result = insertMarkdownLink('см. тут', { start: 4, end: 7 }, { href: '/d', label: 'X' });
    expect(result.text).toBe('см. [тут](/d)');
  });
});

describe('selection bounds', () => {
  it('clamps out-of-range selections', () => {
    const result = applyMarkdownFormat('ab', { start: 5, end: 9 }, 'bold');
    expect(result.text).toBe('ab**жирный текст**');
  });
});
