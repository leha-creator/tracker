import { z } from 'zod';

import { normalizeCommentBody, TASK_COMMENT_MAX_LENGTH } from '../../models/task-comment';
import { entityIdField, workspaceIdField } from '../task/task.schema';

const bodyField = z
  .string({ error: 'Напишите комментарий' })
  .transform(normalizeCommentBody)
  .pipe(
    z
      .string()
      .min(1, { error: 'Напишите комментарий' })
      .max(TASK_COMMENT_MAX_LENGTH, {
        error: `Комментарий не длиннее ${TASK_COMMENT_MAX_LENGTH} символов`,
      }),
  );

export const createCommentSchema = z.object({
  workspaceId: workspaceIdField,
  taskId: entityIdField,
  body: bodyField,
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
