import { z } from 'zod';

import {
  normalizeTaskTitle,
  parseTaskNumber,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
} from '../../models/task';
import { TASK_PRIORITIES } from '../../models/task-priority';

export const workspaceIdField = z.string({ error: 'Не указано пространство' }).min(1);

/** id задачи, проекта или статуса из формы. */
export const entityIdField = z.uuid({ error: 'Некорректный идентификатор' });

/** Параметр `[taskNumber]` страницы: не число → 404 без запроса к БД. */
export const taskNumberSchema = z.string().transform((value, ctx) => {
  const number = parseTaskNumber(value);
  if (number === null) {
    ctx.addIssue({ code: 'custom', message: 'Некорректный номер задачи' });
    return z.NEVER;
  }
  return number;
});

const titleField = z
  .string({ error: 'Укажите название' })
  .transform(normalizeTaskTitle)
  .pipe(
    z
      .string()
      .min(1, { error: 'Укажите название' })
      .max(TASK_TITLE_MAX_LENGTH, {
        error: `Название не длиннее ${TASK_TITLE_MAX_LENGTH} символов`,
      }),
  );

const descriptionText = z
  .string()
  .trim()
  .max(TASK_DESCRIPTION_MAX_LENGTH, {
    error: `Описание не длиннее ${TASK_DESCRIPTION_MAX_LENGTH} символов`,
  });

const priorityField = z.enum(TASK_PRIORITIES, { error: 'Недопустимый приоритет' });

const dueDateText = z.union([z.literal(''), z.iso.date({ error: 'Некорректная дата' })]);

const optionalId = z.union([z.literal(''), entityIdField]).optional();

/** Пустая строка из формы → undefined (поле не задано). */
function emptyToUndefined<T>(value: T | '' | undefined): T | undefined {
  return value === '' ? undefined : value;
}

/** Для обновления: поле отсутствует → undefined (не менять), пустое → null (очистить). */
function emptyToNull<T>(value: T | '' | undefined): T | null | undefined {
  return value === '' ? null : value;
}

export const createTaskSchema = z
  .object({
    workspaceId: workspaceIdField,
    title: titleField,
    description: descriptionText.optional().transform(emptyToUndefined),
    priority: priorityField.default('none'),
    dueDate: dueDateText.optional().transform(emptyToUndefined),
    assigneeId: z.string().optional().transform(emptyToUndefined),
    projectId: optionalId.transform(emptyToUndefined),
    statusId: optionalId.transform(emptyToUndefined),
  })
  .refine((input) => Boolean(input.projectId) === Boolean(input.statusId), {
    error: 'Выберите и проект, и статус',
    path: ['statusId'],
  })
  .transform(({ projectId, statusId, ...input }) => ({
    ...input,
    placement: projectId && statusId ? { projectId, statusId } : undefined,
  }));

export const updateTaskSchema = z.object({
  workspaceId: workspaceIdField,
  taskId: entityIdField,
  title: titleField.optional(),
  description: descriptionText.optional().transform(emptyToNull),
  priority: priorityField.optional(),
  dueDate: dueDateText.optional().transform(emptyToNull),
  assigneeId: z.string().optional().transform(emptyToNull),
});

export const deleteTaskSchema = z.object({ workspaceId: workspaceIdField, taskId: entityIdField });

export const listTasksSchema = z.object({
  workspaceId: workspaceIdField,
  cursor: z.string().max(100).optional(),
});

export type CreateTaskFormInput = z.input<typeof createTaskSchema>;
export type UpdateTaskFormInput = z.input<typeof updateTaskSchema>;
