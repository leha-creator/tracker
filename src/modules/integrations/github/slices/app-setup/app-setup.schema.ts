import { z } from 'zod';

/** Логин организации GitHub: буквы, цифры и дефис, до 39 символов. */
const organizationLogin = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/, {
    error: 'Некорректный логин организации',
  });

export const startAppManifestSchema = z
  .object({
    // Имя приложения уникально на всём GitHub, не длиннее 34 символов.
    name: z
      .string()
      .trim()
      .min(1, { error: 'Укажите название' })
      .max(34, { error: 'Не длиннее 34 символов' }),
    owner: z.enum(['user', 'organization']),
    organization: z.string().optional(),
    isPublic: z.stringbool().default(true),
  })
  .transform((input, ctx) => {
    if (input.owner === 'user') return { ...input, organization: null };
    const parsed = organizationLogin.safeParse(input.organization ?? '');
    if (!parsed.success) {
      ctx.addIssue({
        code: 'custom',
        path: ['organization'],
        message: 'Некорректный логин организации',
      });
      return z.NEVER;
    }
    return { ...input, organization: parsed.data };
  });

export type StartAppManifestInput = z.input<typeof startAppManifestSchema>;

/** Параметры, с которыми GitHub возвращает на redirect_url манифеста. */
export const manifestCallbackSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  state: z.string().min(1).max(1024),
});
