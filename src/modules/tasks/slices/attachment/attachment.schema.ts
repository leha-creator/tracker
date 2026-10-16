import { z } from 'zod';

import { ATTACHMENT_TARGETS } from '../../models/task-attachment';
import { entityIdField, workspaceIdField } from '../task/task.schema';

/** Запрос слота загрузки. Тип и размер проверяет модель — с понятными сообщениями. */
export const requestUploadSchema = z.object({
  workspaceId: workspaceIdField,
  taskId: entityIdField,
  target: z.enum(ATTACHMENT_TARGETS, { error: 'Некорректное место вложения' }),
  fileName: z.string({ error: 'Не указано имя файла' }).min(1).max(1000),
  size: z.number({ error: 'Не указан размер файла' }).int().min(0),
});

const attachmentKeySchema = z.object({
  workspaceId: workspaceIdField,
  taskId: entityIdField,
  attachmentId: entityIdField,
});

export const completeUploadSchema = attachmentKeySchema;
export const deleteAttachmentSchema = attachmentKeySchema;

export type AttachmentKey = z.infer<typeof attachmentKeySchema>;
