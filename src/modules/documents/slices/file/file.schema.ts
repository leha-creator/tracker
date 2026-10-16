import { z } from 'zod';

import { entityIdField, optionalFolderIdField, workspaceIdField } from '../folder/folder.schema';

export const requestDocumentUploadSchema = z.object({
  workspaceId: workspaceIdField,
  folderId: optionalFolderIdField,
  fileName: z.string({ error: 'Не указано имя файла' }).min(1).max(1000),
  size: z.coerce.number({ error: 'Не указан размер файла' }).int().nonnegative(),
});

export const documentUploadKeySchema = z.object({
  workspaceId: workspaceIdField,
  documentId: entityIdField,
});

export type RequestDocumentUploadInput = z.infer<typeof requestDocumentUploadSchema>;
export type DocumentUploadKey = z.infer<typeof documentUploadKeySchema>;
