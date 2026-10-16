import { z } from 'zod';

import { COMMENT_ATTACHMENTS_LIMIT } from '../../models/task-attachment';
import { normalizeCommentBody, TASK_COMMENT_MAX_LENGTH } from '../../models/task-comment';
import { entityIdField, workspaceIdField } from '../task/task.schema';

export const EMPTY_COMMENT_MESSAGE = 'Напишите комментарий или приложите файл';

/** Текст может быть пустым, если у комментария есть файлы (проверяется отдельно). */
const bodyField = z
  .string()
  .default('')
  .transform(normalizeCommentBody)
  .pipe(
    z.string().max(TASK_COMMENT_MAX_LENGTH, {
      error: `Комментарий не длиннее ${TASK_COMMENT_MAX_LENGTH} символов`,
    }),
  );

export const createCommentSchema = z
  .object({
    workspaceId: workspaceIdField,
    taskId: entityIdField,
    body: bodyField,
    /** Готовые черновики-файлы формы (поле `attachmentId`, несколько значений). */
    attachmentIds: z
      .array(entityIdField)
      .max(COMMENT_ATTACHMENTS_LIMIT, {
        error: `К комментарию можно приложить не больше ${COMMENT_ATTACHMENTS_LIMIT} файлов`,
      })
      .default([]),
  })
  .superRefine((value, ctx) => {
    if (value.body === '' && value.attachmentIds.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['body'], message: EMPTY_COMMENT_MESSAGE });
    }
  });

export const updateCommentSchema = z.object({
  workspaceId: workspaceIdField,
  taskId: entityIdField,
  commentId: entityIdField,
  body: bodyField,
});

export const deleteCommentSchema = z.object({
  workspaceId: workspaceIdField,
  taskId: entityIdField,
  commentId: entityIdField,
});
