import { z } from 'zod';

import { entityIdField, optionalFolderIdField, workspaceIdField } from '../folder/folder.schema';

/** Название и текст проверяет и нормализует модель — с ошибками полей `title` и `content`. */
const titleField = z.string({ error: 'Введите название' });
const contentField = z.string().default('');

export const createNoteSchema = z.object({
  workspaceId: workspaceIdField,
  folderId: optionalFolderIdField,
  title: titleField,
  content: contentField,
  /** Заметка создаётся из задачи — сразу привязать к ней. */
  linkTaskId: entityIdField.optional(),
});

export const updateNoteSchema = z.object({
  workspaceId: workspaceIdField,
  documentId: entityIdField,
  title: titleField,
  content: contentField,
  version: z.coerce.number({ error: 'Не указана версия документа' }).int().positive(),
});

export const renameDocumentSchema = z.object({
  workspaceId: workspaceIdField,
  documentId: entityIdField,
  title: titleField,
});

export const moveDocumentSchema = z.object({
  workspaceId: workspaceIdField,
  documentId: entityIdField,
  folderId: optionalFolderIdField,
});

export const deleteDocumentSchema = z.object({
  workspaceId: workspaceIdField,
  documentId: entityIdField,
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
