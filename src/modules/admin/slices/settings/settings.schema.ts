import { z } from 'zod';

import { SIGNUP_MODES } from '@/shared/resource-settings/client';

// Две независимые группы, как в shared/resource-settings: «Регистрация» (переедет в IdP) и
// «Хранилище». У каждой — своя схема, действие и форма.

export const ALLOWED_EMAIL_DOMAINS_MAX = 50;
export const DEFAULT_QUOTA_MIN_MB = 1;
export const DEFAULT_QUOTA_MAX_MB = 1_000_000;

/** Домен без схемы и @: `example.com`, `mail.example.co.uk`. */
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Домены из textarea: через пробел, запятую, точку с запятой или с новой строки; `@` в начале снимаем. */
export function parseEmailDomains(value: string): string[] {
  const domains = value
    .split(/[\s,;]+/)
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  return [...new Set(domains)];
}

export const updateSignupPolicySchema = z.object({
  signupMode: z.enum(SIGNUP_MODES, { error: 'Выберите режим регистрации' }),
  allowedEmailDomains: z
    .string()
    .max(20_000, { error: 'Слишком длинный список доменов' })
    .optional()
    .transform((value) => parseEmailDomains(value ?? ''))
    .superRefine((domains, ctx) => {
      if (domains.length > ALLOWED_EMAIL_DOMAINS_MAX) {
        ctx.addIssue({
          code: 'custom',
          message: `Не больше ${ALLOWED_EMAIL_DOMAINS_MAX} доменов`,
        });
        return;
      }
      const invalid = domains.filter((domain) => !DOMAIN_PATTERN.test(domain));
      if (invalid.length > 0) {
        ctx.addIssue({
          code: 'custom',
          message: `Некорректные домены: ${invalid.slice(0, 5).join(', ')}`,
        });
      }
    }),
});

export const updateStorageSettingsSchema = z.object({
  // Пустое поле — квота из окружения (DOCUMENTS_WORKSPACE_QUOTA_MB).
  defaultWorkspaceQuotaMb: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null))
    .pipe(
      z.union([
        z.null(),
        z
          .string()
          .regex(/^\d{1,7}$/, { error: 'Целое число мегабайт' })
          .transform(Number)
          .pipe(
            z
              .number()
              .min(DEFAULT_QUOTA_MIN_MB, { error: 'Не меньше 1 МБ' })
              .max(DEFAULT_QUOTA_MAX_MB, { error: 'Не больше 1 000 000 МБ' }),
          ),
      ]),
    ),
});

export type UpdateSignupPolicyInput = z.infer<typeof updateSignupPolicySchema>;
export type UpdateStorageSettingsInput = z.infer<typeof updateStorageSettingsSchema>;
