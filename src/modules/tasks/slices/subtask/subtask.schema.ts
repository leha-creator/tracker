import { z } from 'zod';

import { entityIdField, workspaceIdField } from '../task/task.schema';

/** Смена родителя: пустая строка — сделать задачей верхнего уровня. */
export const setTaskParentSchema = z.object({
  workspaceId: workspaceIdField,
  taskId: entityIdField,
  parentId: z
    .union([z.literal(''), entityIdField])
    .nullish()
    .transform((value) => value || null),
});

/** Длина строки поиска родителя. */
export const PARENT_SEARCH_MAX_LENGTH = 100;

export const searchParentSchema = z.object({
  workspaceId: workspaceIdField,
  taskId: entityIdField,
  q: z.string().trim().max(PARENT_SEARCH_MAX_LENGTH).catch(''),
});

export type SetTaskParentInput = z.output<typeof setTaskParentSchema>;
