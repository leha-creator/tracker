import { z } from 'zod';

import { normalizeSearchQuery, SEARCH_QUERY_MAX_LENGTH } from '../../models';

export const globalSearchSchema = z.object({
  /** Текущее пространство из адреса; пусто — поиск по пространствам пользователя. */
  workspaceId: z
    .string()
    .max(64)
    .nullish()
    .transform((value) => value || null),
  q: z
    .string()
    // Длинная строка обрезается, а не отклоняется: палитра отправляет то, что ввёл пользователь.
    .max(SEARCH_QUERY_MAX_LENGTH * 10)
    .transform(normalizeSearchQuery)
    .catch(''),
});

export type GlobalSearchInput = z.output<typeof globalSearchSchema>;
