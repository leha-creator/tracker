import { z } from 'zod';

import { SAVED_VIEW_PARAMS_MAX_LENGTH } from '../../models';
import { entityIdField, workspaceIdField } from '../task/task.schema';

/** Пустое поле формы → undefined. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

/** Где лежит фильтр: «Мои задачи» — без пространства, проект — с проектом. */
export const savedViewTargetSchema = z
  .object({
    scope: z.enum(['workspace', 'project', 'mine'], { error: 'Неизвестный список' }),
    workspaceId: optional(workspaceIdField),
    projectId: optional(entityIdField),
  })
  .refine((value) => value.scope === 'mine' || value.workspaceId !== undefined, {
    message: 'Не указано пространство',
  })
  .refine((value) => value.scope !== 'project' || value.projectId !== undefined, {
    message: 'Не указан проект',
  });

/** Имя проверяет и нормализует модель (`normalizeViewName`) — с ошибкой поля `name`. */
const nameField = z.string({ error: 'Введите название фильтра' });

export const createSavedViewSchema = z.intersection(
  savedViewTargetSchema,
  z.object({
    name: nameField,
    params: z.string().max(SAVED_VIEW_PARAMS_MAX_LENGTH * 2, 'Слишком длинный фильтр'),
  }),
);

export const renameSavedViewSchema = z.object({ viewId: entityIdField, name: nameField });

export const deleteSavedViewSchema = z.object({ viewId: entityIdField });
