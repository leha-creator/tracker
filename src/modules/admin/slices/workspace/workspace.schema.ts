import { z } from 'zod';

import { WORKSPACE_QUOTA_MAX_MB, WORKSPACE_QUOTA_MIN_MB } from '../../models/admin-workspace';
import { userIdField } from '../user/user.schema';

/** id пространства — строка Better Auth (не UUID). */
const workspaceIdField = z
  .string({ error: 'Не указано пространство' })
  .regex(/^[A-Za-z0-9_-]{1,64}$/, { error: 'Некорректный идентификатор пространства' });

export const workspaceIdSchema = z.object({ workspaceId: workspaceIdField });

export const deleteWorkspaceSchema = z.object({
  workspaceId: workspaceIdField,
  confirmName: z
    .string({ error: 'Введите название пространства' })
    .trim()
    .min(1, { error: 'Введите название пространства' })
    .max(200),
});

export const transferOwnershipSchema = z.object({
  workspaceId: workspaceIdField,
  userId: userIdField,
  // Флажок формы: «on» — отмечен, отсутствует — нет.
  demotePreviousOwners: z
    .literal('on')
    .optional()
    .transform((value) => value === 'on'),
});

export const setStorageQuotaSchema = z.object({
  workspaceId: workspaceIdField,
  // Пустое поле — квота по умолчанию ресурса.
  quotaMb: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null))
    .pipe(
      z.union([
        z.null(),
        z
          .string()
          .regex(/^\d{1,7}$/, { error: 'Целое число мегабайт, не меньше 0' })
          .transform(Number)
          .pipe(
            z
              .number()
              .min(WORKSPACE_QUOTA_MIN_MB, { error: 'Не меньше 0 МБ' })
              .max(WORKSPACE_QUOTA_MAX_MB, { error: 'Не больше 1 000 000 МБ' }),
          ),
      ]),
    ),
});

export type DeleteWorkspaceInput = z.infer<typeof deleteWorkspaceSchema>;
export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>;
export type SetStorageQuotaInput = z.infer<typeof setStorageQuotaSchema>;
