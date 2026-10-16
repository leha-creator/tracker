import { z } from 'zod';

import { API_TOKEN_EXPIRY_OPTIONS, API_TOKEN_NAME_MAX_LENGTH } from '../../models/api-token';

export const createApiTokenSchema = z.object({
  name: z
    .string({ error: 'Укажите название' })
    .trim()
    .min(1, { error: 'Укажите название' })
    .max(API_TOKEN_NAME_MAX_LENGTH, {
      error: `Название не длиннее ${API_TOKEN_NAME_MAX_LENGTH} символов`,
    }),
  workspaceId: z.string({ error: 'Выберите пространство' }).min(1, 'Выберите пространство'),
  expiry: z.enum(API_TOKEN_EXPIRY_OPTIONS, { error: 'Выберите срок' }).default('90d'),
});

export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;

export const revokeApiTokenSchema = z.object({
  tokenId: z.uuid({ error: 'Некорректный идентификатор' }),
});
