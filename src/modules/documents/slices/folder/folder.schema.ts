import { z } from 'zod';

export const workspaceIdField = z.string({ error: 'Не указано пространство' }).min(1);

/** id папки, документа или тега из формы. */
export const entityIdField = z.uuid({ error: 'Некорректный идентификатор' });

/** Пустая строка или «root» из формы — корень пространства (null). */
export const optionalFolderIdField = z
  .string()
  .optional()
  .transform((value) => (value && value !== 'root' ? value : null))
  .pipe(entityIdField.nullable());

/** Имя проверяет и нормализует модель (`normalizeFolderName`) — с ошибкой поля `name`. */
const nameField = z.string({ error: 'Введите название папки' });

export const createFolderSchema = z.object({
  workspaceId: workspaceIdField,
  parentId: optionalFolderIdField,
  name: nameField,
});

export const renameFolderSchema = z.object({
  workspaceId: workspaceIdField,
  folderId: entityIdField,
  name: nameField,
});

export const moveFolderSchema = z.object({
  workspaceId: workspaceIdField,
  folderId: entityIdField,
  targetId: optionalFolderIdField,
});

export const deleteFolderSchema = z.object({
  workspaceId: workspaceIdField,
  folderId: entityIdField,
});

export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type RenameFolderInput = z.infer<typeof renameFolderSchema>;
export type MoveFolderInput = z.infer<typeof moveFolderSchema>;
export type DeleteFolderInput = z.infer<typeof deleteFolderSchema>;
