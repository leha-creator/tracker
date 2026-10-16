import { z } from 'zod';

import { entityIdField, workspaceIdField } from '../folder/folder.schema';

const queryField = z
  .string()
  .optional()
  .transform((value) => (value ?? '').trim().replace(/\s+/g, ' ').slice(0, 100));

export const taskLinkSchema = z.object({
  workspaceId: workspaceIdField,
  taskId: entityIdField,
  documentId: entityIdField,
});

export const searchDocumentsForLinkSchema = z.object({
  workspaceId: workspaceIdField,
  q: queryField,
  /** Задача, к которой привязывают: её документы не предлагаются. */
  taskId: entityIdField.optional(),
});

export const searchTasksForLinkSchema = z.object({
  workspaceId: workspaceIdField,
  q: queryField,
  /** Документ, который привязывают: его задачи не предлагаются. */
  documentId: entityIdField.optional(),
});

export type TaskLinkInput = z.infer<typeof taskLinkSchema>;
