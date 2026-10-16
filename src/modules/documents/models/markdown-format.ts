/**
 * Форматирование Markdown в текстовом поле редактора: чистые функции над текстом и выделением.
 * Повторное применение снимает форматирование (кнопки панели работают как переключатели).
 */

export interface TextSelection {
  start: number;
  end: number;
}

export interface FormatResult {
  text: string;
  selection: TextSelection;
}

export const INLINE_ACTIONS = ['bold', 'italic', 'strike', 'code'] as const;
export const LINE_ACTIONS = ['heading', 'quote', 'bulletList', 'orderedList', 'checklist'] as const;
export const BLOCK_ACTIONS = ['codeBlock', 'table'] as const;

export type InlineAction = (typeof INLINE_ACTIONS)[number];
export type LineAction = (typeof LINE_ACTIONS)[number];
export type BlockAction = (typeof BLOCK_ACTIONS)[number];
export type MarkdownAction = InlineAction | LineAction | BlockAction | 'link';

const INLINE_MARKERS: Record<InlineAction, { marker: string; placeholder: string }> = {
  bold: { marker: '**', placeholder: 'жирный текст' },
  italic: { marker: '_', placeholder: 'курсив' },
  strike: { marker: '~~', placeholder: 'зачёркнутый текст' },
  code: { marker: '`', placeholder: 'код' },
};

/** Префиксы строк; `pattern` находит уже существующий префикс этого вида. */
const LINE_PREFIXES: Record<
  LineAction,
  { prefix: (index: number) => string; pattern: RegExp; active?: RegExp }
> = {
  // Любой уровень заголовка заменяется на `## `; снимается только `## `.
  heading: { prefix: () => '## ', pattern: /^#{1,6} /, active: /^## / },
  quote: { prefix: () => '> ', pattern: /^> ?/ },
  bulletList: { prefix: () => '- ', pattern: /^[-*+] (?!\[[ xX]\] )/ },
  orderedList: { prefix: (index) => `${index + 1}. `, pattern: /^\d+\. / },
  checklist: { prefix: () => '- [ ] ', pattern: /^[-*+] \[[ xX]\] / },
};

/** Маркеры списков снимаются при смене вида списка (маркированный → нумерованный и т.п.). */
const LIST_PATTERN = /^(?:[-*+] \[[ xX]\] |[-*+] |\d+\. )/;

const TABLE_TEMPLATE = '| Колонка 1 | Колонка 2 |\n| --- | --- |\n|  |  |';
const URL_RE = /^(?:https?:\/\/|mailto:)\S+$/i;

function clampSelection(text: string, selection: TextSelection): TextSelection {
  const start = Math.max(0, Math.min(selection.start, text.length));
  const end = Math.max(start, Math.min(selection.end, text.length));
  return { start, end };
}

function replaceRange(
  text: string,
  start: number,
  end: number,
  insert: string,
  selection: TextSelection,
): FormatResult {
  return { text: text.slice(0, start) + insert + text.slice(end), selection };
}

function applyInline(text: string, { start, end }: TextSelection, action: InlineAction) {
  const { marker, placeholder } = INLINE_MARKERS[action];
  const m = marker.length;
  const selected = text.slice(start, end);

  // Выделение целиком с маркерами: **текст** → текст.
  if (selected.length >= 2 * m && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(m, -m);
    return replaceRange(text, start, end, inner, { start, end: start + inner.length });
  }
  // Маркеры вокруг выделения: **[текст]** → текст.
  if (text.slice(start - m, start) === marker && text.slice(end, end + m) === marker) {
    return replaceRange(text, start - m, end + m, selected, {
      start: start - m,
      end: end - m,
    });
  }

  const inner = selected === '' ? placeholder : selected;
  return replaceRange(text, start, end, `${marker}${inner}${marker}`, {
    start: start + m,
    end: start + m + inner.length,
  });
}

/** Границы строк, которых касается выделение. */
function lineRange(text: string, { start, end }: TextSelection): TextSelection {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  // Выделение, закончившееся в начале строки, эту строку не захватывает.
  const effectiveEnd = end > start && text[end - 1] === '\n' ? end - 1 : end;
  const newline = text.indexOf('\n', effectiveEnd);
  return { start: lineStart, end: newline === -1 ? text.length : newline };
}

function applyLine(text: string, selection: TextSelection, action: LineAction): FormatResult {
  const range = lineRange(text, selection);
  const lines = text.slice(range.start, range.end).split('\n');
  const { prefix, pattern, active = pattern } = LINE_PREFIXES[action];
  const single = lines.length === 1;
  const target = (line: string) => single || line.trim() !== '';

  const allFormatted = lines.filter(target).every((line) => active.test(line));
  let index = 0;
  const next = lines.map((line) => {
    if (!target(line)) return line;
    if (allFormatted) return line.replace(pattern, '');
    const stripped =
      action === 'heading' || action === 'quote'
        ? line.replace(pattern, '')
        : line.replace(LIST_PATTERN, '');
    return prefix(index++) + stripped;
  });

  const block = next.join('\n');
  const cursorOnly = selection.start === selection.end;
  return replaceRange(text, range.start, range.end, block, {
    start: cursorOnly ? range.start + block.length : range.start,
    end: range.start + block.length,
  });
}

/** Вставка блока отдельными строками: при необходимости добавляет переводы строк вокруг. */
function insertBlock(text: string, { start, end }: TextSelection, block: string) {
  const before = start > 0 && text[start - 1] !== '\n' ? '\n' : '';
  const after = end < text.length && text[end] !== '\n' ? '\n' : '';
  return { insert: `${before}${block}${after}`, offset: start + before.length };
}

function applyCodeBlock(text: string, selection: TextSelection): FormatResult {
  const { start, end } = selection;
  const selected = text.slice(start, end);
  const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(selected);
  if (fenced) {
    const inner = fenced[1] ?? '';
    return replaceRange(text, start, end, inner, { start, end: start + inner.length });
  }

  const body = selected.replace(/\n$/, '');
  const { insert, offset } = insertBlock(text, selection, `\`\`\`\n${body}\n\`\`\``);
  const bodyStart = offset + 4;
  return replaceRange(text, start, end, insert, {
    start: bodyStart,
    end: bodyStart + body.length,
  });
}

function applyTable(text: string, selection: TextSelection): FormatResult {
  // Таблица вставляется после выделения: выделенный текст не теряется.
  const at = { start: selection.end, end: selection.end };
  const { insert, offset } = insertBlock(text, at, TABLE_TEMPLATE);
  const headerStart = offset + 2;
  return replaceRange(text, at.start, at.end, insert, {
    start: headerStart,
    end: headerStart + 'Колонка 1'.length,
  });
}

/**
 * Ссылка `[текст](адрес)`. Без `href`: выделенный адрес становится адресом, иначе выделяется
 * заготовка адреса для ввода. С `href` (ссылка на документ) — подпись из выделения или `label`.
 */
export function insertMarkdownLink(
  text: string,
  rawSelection: TextSelection,
  link: { href?: string; label?: string } = {},
): FormatResult {
  const selection = clampSelection(text, rawSelection);
  const { start, end } = selection;
  const selected = text.slice(start, end).replace(/[[\]]/g, '');
  // Скобки и пробелы обрывают адрес ссылки Markdown; encodeURIComponent скобки не кодирует.
  const escape = (value: string) =>
    value.replace(/[()\s]/g, (char) => {
      const hex = char.charCodeAt(0).toString(16).toUpperCase();
      return `%${hex.padStart(2, '0')}`;
    });

  if (link.href) {
    const label = selected || (link.label ?? link.href).replace(/[[\]]/g, '');
    const insert = `[${label}](${escape(link.href)})`;
    return replaceRange(text, start, end, insert, {
      start: start + insert.length,
      end: start + insert.length,
    });
  }

  if (URL_RE.test(selected)) {
    const insert = `[ссылка](${escape(selected)})`;
    return replaceRange(text, start, end, insert, { start: start + 1, end: start + 7 });
  }

  const label = selected || 'текст ссылки';
  const url = 'https://';
  const insert = `[${label}](${url})`;
  const urlStart = start + label.length + 3;
  return replaceRange(text, start, end, insert, { start: urlStart, end: urlStart + url.length });
}

export function applyMarkdownFormat(
  text: string,
  rawSelection: TextSelection,
  action: MarkdownAction,
): FormatResult {
  const selection = clampSelection(text, rawSelection);
  switch (action) {
    case 'bold':
    case 'italic':
    case 'strike':
    case 'code':
      return applyInline(text, selection, action);
    case 'heading':
    case 'quote':
    case 'bulletList':
    case 'orderedList':
    case 'checklist':
      return applyLine(text, selection, action);
    case 'codeBlock':
      return applyCodeBlock(text, selection);
    case 'table':
      return applyTable(text, selection);
    case 'link':
      return insertMarkdownLink(text, selection);
  }
}
