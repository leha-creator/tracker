import { z } from 'zod';

import { DOCUMENT_TAG_COLORS } from '../../models';
import { entityIdField, workspaceIdField } from '../folder/folder.schema';

/** Имя проверяет и нормализует модель (`normalizeTagName`) — с ошибкой поля `name`. */
const nameField = z.string({ error: 'Введите название тега' });
const colorField = z.enum(DOCUMENT_TAG_COLORS, { error: 'Недопустимый цвет' }).default('gray');

export const createTagSchema = z.object({
  workspaceId: workspaceIdField,
  name: nameField,
  color: colorField,
});

export const updateTagSchema = createTagSchema.extend({ tagId: entityIdField });

export const deleteTagSchema = z.object({ workspaceId: workspaceIdField, tagId: entityIdField });

/** Теги документа целиком; из формы — несколько полей `tagIds` или один через запятую. */
export const setDocumentTagsSchema = z.object({
  workspaceId: workspaceIdField,
  documentId: entityIdField,
  tagIds: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((value) =>
      (Array.isArray(value) ? value : (value ?? '').split(','))
        .map((id) => id.trim())
        .filter(Boolean),
    )
    .pipe(z.array(entityIdField).max(50)),
});

export type SetDocumentTagsInput = z.infer<typeof setDocumentTagsSchema>;
