import { z } from 'zod';

/** Id GitHub (установки, репозитория) — строка из цифр: BigInt не сериализуется в формах и JSON. */
export const githubIdField = z
  .string({ error: 'Не указан идентификатор GitHub' })
  .regex(/^[1-9]\d{0,18}$/, { error: 'Некорректный идентификатор GitHub' });

const workspaceIdField = z.string({ error: 'Не указано пространство' }).min(1);

export const workspaceSchema = z.object({ workspaceId: workspaceIdField });

export const installationRefSchema = z.object({
  workspaceId: workspaceIdField,
  installationId: githubIdField,
});

export const repositoryToggleSchema = z.object({
  workspaceId: workspaceIdField,
  repositoryId: githubIdField,
  enabled: z.stringbool(),
});

/** Параметры, с которыми GitHub возвращает на Setup URL. */
export const setupCallbackSchema = z.object({
  installation_id: githubIdField,
  setup_action: z.string().max(32).optional(),
  // Нет при «Redirect on update» (изменили доступ к репозиториям на GitHub).
  state: z.string().min(1).max(1024).optional(),
});
