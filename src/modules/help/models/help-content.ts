/**
 * Разбор Markdown статей справки: заголовки для оглавления, картинки и ссылки — для тестов
 * целостности. Блоки кода пропускаются: `# комментарий` в bash — не заголовок.
 */

export interface HelpHeading {
  depth: 2 | 3;
  text: string;
  id: string;
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

/** Строки вне блоков кода (```` ``` ```` / `~~~`). */
function linesOutsideCode(markdown: string): string[] {
  const result: string[] = [];
  let fence: string | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const match = FENCE.exec(line);
    if (match) {
      const marker = match[1]!;
      if (fence === null) fence = marker[0]!.repeat(marker.length);
      else if (marker.startsWith(fence)) fence = null;
      continue;
    }
    if (fence === null) result.push(line);
  }
  return result;
}

/** Текст заголовка без разметки — как его видит `MarkdownView` (текст узлов hast). */
function plainHeadingText(raw: string): string {
  return (
    raw
      .replace(/\s+#+\s*$/, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      // `_` внутри слова (start_task) — не курсив: по CommonMark подчёркивание выделяет только целые слова.
      .replace(/(?<![\p{L}\p{N}_])(__|_)(?!\s)(.+?)(?<!\s)\1(?![\p{L}\p{N}_])/gu, '$2')
      .trim()
  );
}

/**
 * Заголовки `##` и `###` с теми же id, что даёт `MarkdownView`. Slugger передаётся снаружи
 * (модели не импортируют компоненты); он учитывает все заголовки, включая `#` и `####`,
 * чтобы нумерация повторов совпала с рендером.
 */
export function extractHeadings(
  markdown: string,
  slugger: (text: string) => string,
): HelpHeading[] {
  const headings: HelpHeading[] = [];
  for (const line of linesOutsideCode(markdown)) {
    const match = /^\s{0,3}(#{1,6})\s+(.+)$/.exec(line);
    if (!match) continue;
    const depth = match[1]!.length;
    const text = plainHeadingText(match[2]!);
    const id = slugger(text);
    if (depth === 2 || depth === 3) headings.push({ depth, text, id });
  }
  return headings;
}

/** Адреса картинок `![alt](src "title")` вне блоков кода. */
export function extractImageRefs(markdown: string): string[] {
  const refs: string[] = [];
  for (const line of linesOutsideCode(markdown)) {
    for (const match of line.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g)) {
      refs.push(match[1]!);
    }
  }
  return refs;
}

/** Ссылки на статьи справки `/help/<slug>[#якорь]` вне блоков кода. */
export function extractHelpLinks(markdown: string): { slug: string; anchor: string | null }[] {
  const links: { slug: string; anchor: string | null }[] = [];
  for (const line of linesOutsideCode(markdown)) {
    for (const match of line.matchAll(
      /(?<!!)\[[^\]]*\]\(\s*\/help\/([a-z0-9-]+)(?:#([^)\s]+))?\s*\)/g,
    )) {
      links.push({ slug: match[1]!, anchor: match[2] ? decodeURIComponent(match[2]) : null });
    }
  }
  return links;
}
