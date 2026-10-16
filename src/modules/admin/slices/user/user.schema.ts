import { z } from 'zod';

import { GLOBAL_ROLES } from '@/shared/access/global-role';

import { BAN_DURATIONS, BAN_REASON_MAX_LENGTH } from '../../models/admin-user';

/** id пользователя Better Auth — не UUID, поэтому только длина и допустимые символы. */
export const userIdField = z
  .string({ error: 'Не указан пользователь' })
  .regex(/^[A-Za-z0-9_-]{1,64}$/, { error: 'Некорректный идентификатор пользователя' });

export const userIdSchema = z.object({ userId: userIdField });

export const banUserSchema = z.object({
  userId: userIdField,
  reason: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? '')
    .pipe(
      z.string().max(BAN_REASON_MAX_LENGTH, {
        error: `Причина не длиннее ${BAN_REASON_MAX_LENGTH} символов`,
      }),
    ),
  duration: z.enum(BAN_DURATIONS, { error: 'Выберите срок блокировки' }),
});

export const setUserRoleSchema = z.object({
  userId: userIdField,
  role: z.enum(GLOBAL_ROLES, { error: 'Недопустимая роль' }),
});

export const deleteUserSchema = z.object({
  userId: userIdField,
  confirmEmail: z
    .string({ error: 'Введите email пользователя' })
    .trim()
    .min(1, { error: 'Введите email пользователя' })
    .max(320),
});

export type BanUserInput = z.infer<typeof banUserSchema>;
export type SetUserRoleInput = z.infer<typeof setUserRoleSchema>;
export type DeleteUserInput = z.infer<typeof deleteUserSchema>;
