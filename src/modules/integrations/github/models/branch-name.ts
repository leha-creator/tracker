import { transliterate } from '@/shared/text';

/** Длина имени ветки, которое предлагается скопировать. */
export const SUGGESTED_BRANCH_MAX_LENGTH = 50;

/**
 * Имя ветки для задачи: `tsk-42-pochinit-vkhod` — ключ (по нему ветка привяжется к задаче) и
 * транслитерированное название. Слова не обрезаются посередине, если хватает места.
 */
export function suggestBranchName(taskKey: string, title: string): string {
  const prefix = taskKey.toLowerCase();
  const slug = transliterate(title)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) return prefix;

  const room = SUGGESTED_BRANCH_MAX_LENGTH - prefix.length - 1;
  if (room <= 0) return prefix;
  if (slug.length <= room) return `${prefix}-${slug}`;
  const cut = slug.slice(0, room);
  const lastDash = cut.lastIndexOf('-');
  // Режем по границе слова, если не теряем больше половины места.
  const trimmed = lastDash > room / 2 ? cut.slice(0, lastDash) : cut.replace(/-+$/, '');
  return `${prefix}-${trimmed}`;
}

/** Первая строка сообщения коммита для хранения и показа. */
export const COMMIT_TITLE_MAX_LENGTH = 200;

export function commitTitle(message: string): string {
  const line = (message.split('\n', 1)[0] ?? '').trim();
  return line.length > COMMIT_TITLE_MAX_LENGTH
    ? `${line.slice(0, COMMIT_TITLE_MAX_LENGTH - 1).trimEnd()}…`
    : line;
}
