import { z } from 'zod';

import { AVATAR_CONTENT_TYPES, AVATAR_MAX_SIZE } from '../../models/avatar';

const contentType = z.enum(AVATAR_CONTENT_TYPES, {
  error: 'Загрузите картинку PNG, JPEG или WebP',
});

export const requestAvatarUploadSchema = z.object({
  contentType,
  size: z
    .number()
    .int()
    .min(1, 'Файл пустой')
    .max(AVATAR_MAX_SIZE, `Фото — не больше ${AVATAR_MAX_SIZE / 1024 / 1024} МБ`),
});

export const completeAvatarUploadSchema = z.object({
  uploadId: z.uuid({ error: 'Некорректный идентификатор загрузки' }),
  contentType,
});

export type RequestAvatarUploadInput = z.infer<typeof requestAvatarUploadSchema>;
export type CompleteAvatarUploadInput = z.infer<typeof completeAvatarUploadSchema>;
