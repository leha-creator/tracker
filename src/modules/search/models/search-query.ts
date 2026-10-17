/** Максимальная длина строки поиска палитры. */
export const SEARCH_QUERY_MAX_LENGTH = 100;

/** Минимальная длина запроса; номер задачи (`7`, `#7`) ищется с одного символа. */
export const SEARCH_QUERY_MIN_LENGTH = 2;

/** Сколько результатов в каждой группе (задачи, документы, участники, пространства). */
export const SEARCH_LIMIT_PER_GROUP = 5;

const TASK_NUMBER_RE = /^#?\d+$/;

/** Обрезка, сжатие пробелов и ограничение длины. */
export function normalizeSearchQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, SEARCH_QUERY_MAX_LENGTH).trim();
}

/** Достаточно ли запроса для поиска: от 2 символов или номер задачи. */
export function isSearchableQuery(q: string): boolean {
  return q.length >= SEARCH_QUERY_MIN_LENGTH || TASK_NUMBER_RE.test(q);
}

/** Сравнение без учёта регистра и «ё/е». */
function fold(value: string): string {
  return value.toLocaleLowerCase('ru').replaceAll('ё', 'е');
}

/**
 * Совпадение по части строки: начало строки или слова выше, чем середина. null — не совпадает.
 * Для участников и пространств, которые фильтруются в памяти.
 */
export function matchRank(value: string, q: string): number | null {
  const text = fold(value);
  const needle = fold(q);
  if (!needle) return null;
  if (text.startsWith(needle)) return 0;
  const index = text.indexOf(needle);
  if (index === -1) return null;
  return /[\s.@_-]/.test(text[index - 1] ?? '') ? 1 : 2;
}

/**
 * Лучшие совпадения по нескольким полям (имя, email): ранг — лучший по полям, при равенстве —
 * по первому полю в алфавитном порядке.
 */
export function pickMatches<T>(
  items: readonly T[],
  q: string,
  fields: (item: T) => readonly string[],
  limit = SEARCH_LIMIT_PER_GROUP,
): T[] {
  return items
    .flatMap((item) => {
      const ranks = fields(item).flatMap((value) => {
        const rank = matchRank(value, q);
        return rank === null ? [] : [rank];
      });
      return ranks.length > 0
        ? [{ item, rank: Math.min(...ranks), key: fields(item)[0] ?? '' }]
        : [];
    })
    .sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key, 'ru'))
    .slice(0, limit)
    .map(({ item }) => item);
}
