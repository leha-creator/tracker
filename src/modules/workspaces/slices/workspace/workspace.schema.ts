import { z } from 'zod';

import { ENTITY_ICONS } from '@/shared/entity-icon';

import { normalizeTaskKey, taskKeyProblem } from '../../models/task-key';
import { slugProblem } from '../../models/workspace-slug';

export const WORKSPACE_NAME_MIN_LENGTH = 2;
export const WORKSPACE_NAME_MAX_LENGTH = 80;

const workspaceIdField = z.string({ error: 'Не указано пространство' }).min(1);

const nameField = z
  .string({ error: 'Укажите название' })
  .trim()
  .min(WORKSPACE_NAME_MIN_LENGTH, {
    error: `Название не короче ${WORKSPACE_NAME_MIN_LENGTH} символов`,
  })
  .max(WORKSPACE_NAME_MAX_LENGTH, {
    error: `Название не длиннее ${WORKSPACE_NAME_MAX_LENGTH} символов`,
  });

/** Пустой slug → undefined: сервер сгенерирует его из названия. */
const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .transform((value) => (value ? value : undefined))
  .superRefine((value, ctx) => {
    const problem = value === undefined ? null : slugProblem(value);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });

/** Ключ задач в верхнем регистре; ошибки — по правилам модели. */
const taskKeyField = z
  .string({ error: 'Укажите ключ задач' })
  .transform(normalizeTaskKey)
  .superRefine((value, ctx) => {
    const problem = taskKeyProblem(value);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });

/** Пустой ключ при создании → undefined: сервер предложит его из названия. */
const optionalTaskKeyField = z
  .string()
  .optional()
  .transform((value) => (value?.trim() ? value : undefined))
  .pipe(taskKeyField.optional());

/** Ключ иконки; пусто → undefined (при создании — иконка по id, при правке — без изменений). */
const iconField = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.enum(ENTITY_ICONS, { error: 'Выберите иконку из списка' }).optional(),
);

export const createWorkspaceSchema = z.object({
  name: nameField,
  slug: slugField,
  taskKey: optionalTaskKeyField,
  icon: iconField,
});

export const updateTaskKeySchema = z.object({
  workspaceId: workspaceIdField,
  taskKey: taskKeyField,
});

export const renameWorkspaceSchema = z.object({
  workspaceId: workspaceIdField,
  name: nameField,
  icon: iconField,
});

export const deleteWorkspaceSchema = z.object({
  workspaceId: workspaceIdField,
  confirmName: z.string({ error: 'Введите название пространства' }).trim().min(1, {
    error: 'Введите название пространства',
  }),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type RenameWorkspaceInput = z.infer<typeof renameWorkspaceSchema>;
export type DeleteWorkspaceInput = z.infer<typeof deleteWorkspaceSchema>;
export type UpdateTaskKeyInput = z.infer<typeof updateTaskKeySchema>;
