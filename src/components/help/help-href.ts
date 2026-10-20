/** Адреса справки — одно место для страниц, меню, горячих клавиш и палитры. */
export const HELP_HREF = '/help';

export function helpArticleHref(slug: string, anchor?: string): string {
  return `${HELP_HREF}/${slug}${anchor ? `#${anchor}` : ''}`;
}
