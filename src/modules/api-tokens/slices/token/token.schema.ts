import { z } from 'zod';

import { API_TOKEN_EXPIRY_OPTIONS, API_TOKEN_NAME_MAX_LENGTH } from '../../models/api-token';
import { normalizeScopes } from '../../models/scopes';

const tokenFields = {
  name: z
    .string({ error: 'Укажите название' })
    .trim()
    .min(1, { error: 'Укажите название' })
    .max(API_TOKEN_NAME_MAX_LENGTH, {
      error: `Название не длиннее ${API_TOKEN_NAME_MAX_LENGTH} символов`,
    }),
  workspaceId: z.string({ error: 'Выберите пространство' }).min(1, 'Выберите пространство'),
  expiry: z.enum(API_TOKEN_EXPIRY_OPTIONS, { error: 'Выберите срок' }).default('90d'),
  /** Чекбоксы `scopes` формы (FormData.getAll); `read` добавляется всегда. */
  scopes: z
    .array(z.string())
    .default(['read', 'tasks', 'documents'])
    .transform((values) => normalizeScopes(values)),
};

export const createApiTokenSchema = z.object(tokenFields);
export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;

export const createAgentTokenSchema = z.object({
  ...tokenFields,
  agentId: z.string({ error: 'Не указан агент' }).min(1),
});
export type CreateAgentTokenInput = z.infer<typeof createAgentTokenSchema>;

export const revokeApiTokenSchema = z.object({
  tokenId: z.uuid({ error: 'Некорректный идентификатор' }),
});

export const revokeAgentTokenSchema = z.object({
  workspaceId: z.string().min(1),
  agentId: z.string().min(1),
  tokenId: z.uuid({ error: 'Некорректный идентификатор' }),
});

/** Поля формы с чекбоксами областей: Object.fromEntries теряет повторяющиеся ключи. */
export function tokenFormInput(formData: FormData): Record<string, unknown> {
  return { ...Object.fromEntries(formData), scopes: formData.getAll('scopes') };
}
