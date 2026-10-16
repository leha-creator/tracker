import { z } from 'zod';

import { normalizeTotpCode, TOTP_CODE_LENGTH } from '../../models';
import { PASSWORD_MAX_LENGTH, returnToField } from '../credentials/credentials.schema';

const totpCodeField = z
  .string({ error: 'Введите код' })
  .transform(normalizeTotpCode)
  .pipe(
    z.string().regex(new RegExp(`^\\d{${TOTP_CODE_LENGTH}}$`), {
      error: `Код — ${TOTP_CODE_LENGTH} цифр из приложения`,
    }),
  );

const backupCodeField = z
  .string({ error: 'Введите резервный код' })
  .trim()
  .min(1, { error: 'Введите резервный код' })
  .max(64, { error: 'Неверный резервный код' });

/** Флажок формы: `on` — отмечен. */
const checkboxField = z
  .string()
  .optional()
  .transform((value) => value === 'on' || value === 'true');

export const verifyTotpSchema = z.object({
  code: totpCodeField,
  trustDevice: checkboxField,
  returnTo: returnToField,
});

export const verifyBackupCodeSchema = z.object({
  code: backupCodeField,
  trustDevice: checkboxField,
  returnTo: returnToField,
});

export const passwordConfirmSchema = z.object({
  password: z
    .string({ error: 'Введите пароль' })
    .min(1, { error: 'Введите пароль' })
    .max(PASSWORD_MAX_LENGTH, { error: 'Неверный пароль' }),
});

export const confirmEnableSchema = z.object({ code: totpCodeField });

export type VerifyTotpInput = z.infer<typeof verifyTotpSchema>;
export type VerifyBackupCodeInput = z.infer<typeof verifyBackupCodeSchema>;
export type PasswordConfirmInput = z.infer<typeof passwordConfirmSchema>;
export type ConfirmEnableInput = z.infer<typeof confirmEnableSchema>;
