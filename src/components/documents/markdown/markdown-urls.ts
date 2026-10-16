/**
 * Правила адресов в Markdown документов. Сырой HTML не рендерится вовсе, а адреса ссылок и
 * картинок проходят через эти функции: остальное — защита от XSS и трекинга.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** Картинки показываются только из своих эндпоинтов с проверкой доступа. */
const IMAGE_PREFIXES = ['/api/documents/', '/api/attachments/'];

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

/** Картинку можно показать: относительный адрес своего эндпоинта файлов. */
export function isAllowedImageSrc(src: string | undefined): boolean {
  if (!src) return false;
  return IMAGE_PREFIXES.some((prefix) => src.startsWith(prefix)) && !src.includes('..');
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
