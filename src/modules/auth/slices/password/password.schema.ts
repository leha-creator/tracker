import { z } from 'zod';

import {
  emailField,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../credentials/credentials.schema';

const newPasswordField = z
  .string({ error: 'Введите пароль' })
  .min(PASSWORD_MIN_LENGTH, { error: `Пароль не короче ${PASSWORD_MIN_LENGTH} символов` })
  .max(PASSWORD_MAX_LENGTH, { error: `Пароль не длиннее ${PASSWORD_MAX_LENGTH} символов` });

export const forgotPasswordSchema = z.object({ email: emailField });

export const resetPasswordSchema = z
  .object({
    token: z
      .string({ error: 'Ссылка недействительна' })
      .min(1, { error: 'Ссылка недействительна' })
      .max(256, { error: 'Ссылка недействительна' }),
    password: newPasswordField,
    confirmPassword: z.string({ error: 'Повторите пароль' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: 'Пароли не совпадают',
    path: ['confirmPassword'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: 'Введите текущий пароль' })
      .min(1, { error: 'Введите текущий пароль' })
      .max(PASSWORD_MAX_LENGTH, { error: 'Неверный пароль' }),
    newPassword: newPasswordField,
    confirmPassword: z.string({ error: 'Повторите пароль' }),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    error: 'Пароли не совпадают',
    path: ['confirmPassword'],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    error: 'Новый пароль совпадает с текущим',
    path: ['newPassword'],
  });

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
