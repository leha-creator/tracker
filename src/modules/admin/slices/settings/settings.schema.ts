import { z } from 'zod';

// Группа «Хранилище» настроек ресурса; регистрацию решает IdP plwedding ID.

export const DEFAULT_QUOTA_MIN_MB = 1;
export const DEFAULT_QUOTA_MAX_MB = 1_000_000;

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

export type UpdateStorageSettingsInput = z.infer<typeof updateStorageSettingsSchema>;
