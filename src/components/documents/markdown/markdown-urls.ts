/**
 * Правила адресов в Markdown документов. Сырой HTML не рендерится вовсе, а адреса ссылок и
 * картинок проходят через эти функции: остальное — защита от XSS и трекинга.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** Картинки документов показываются только из своих эндпоинтов с проверкой доступа. */
export const DEFAULT_IMAGE_PREFIXES: readonly string[] = ['/api/documents/', '/api/attachments/'];

/**
 * Адрес ссылки: `http(s)`, `mailto` и относительные адреса; всё прочее (`javascript:`, `data:`,
 * `vbscript:`…) — пустая строка, ссылка выводится текстом.
 */
export function safeMarkdownUrl(raw: string): string {
  const url = raw.trim();
  if (url === '') return '';
  // Протокол — до первого `:`, если раньше нет `/`, `?` или `#`; управляющие символы и пробелы
  // внутри схемы браузеры выбрасывают, поэтому убираем их перед проверкой.
  const normalized = url.replace(/[\u0000- \u007f]/g, '');
  const colon = normalized.indexOf(':');
  const boundary = normalized.search(/[/?#]/);
  const hasScheme = colon !== -1 && (boundary === -1 || colon < boundary);
  if (!hasScheme) return url;
  const protocol = normalized.slice(0, colon + 1).toLowerCase();
  return ALLOWED_PROTOCOLS.has(protocol) ? url : '';
}

/** Внешняя ссылка — открывается в новой вкладке без передачи Referer. */
export function isExternalUrl(url: string): boolean {
  return /^(?:https?:)?\/\//i.test(url) || /^mailto:/i.test(url);
}

/**
 * Картинку можно показать: относительный адрес с разрешённым префиксом. По умолчанию — свои
 * эндпоинты файлов; справка передаёт `/help-media/` (статические скриншоты).
 */
export function isAllowedImageSrc(
  src: string | undefined,
  prefixes: readonly string[] = DEFAULT_IMAGE_PREFIXES,
): boolean {
  if (!src) return false;
  // Выход из папки ловим и в закодированном виде (%2e%2e, %5c): браузер раскодирует путь сам.
  let decoded: string;
  try {
    decoded = decodeURIComponent(src);
  } catch {
    return false;
  }
  if (decoded.includes('..') || decoded.includes('\\')) return false;
  return prefixes.some((prefix) => src.startsWith(prefix));
}

/** id заголовка для якоря: буквы и цифры (в т.ч. кириллица) через дефис; повторы — с номером. */
export function createHeadingSlugger() {
  const seen = new Map<string, number>();
  return (text: string): string => {
    const base =
      text
        .toLocaleLowerCase('ru')
        .normalize('NFC')
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 80) || 'section';
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}
