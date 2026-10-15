import { z } from 'zod';

import { slugProblem } from '../../models/workspace-slug';

export const WORKSPACE_NAME_MIN_LENGTH = 2;
export const WORKSPACE_NAME_MAX_LENGTH = 80;

const workspaceIdField = z.string({ error: 'Не указано пространство' }).min(1);

const nameField = z
  .string({ error: 'Укажите название' })
  .trim()
  .min(WORKSPACE_NAME_MIN_LENGTH, {
    error: `Название не короче ${WORKSPACE_NAME_MIN_LENGTH} символов`,
  })
  .max(WORKSPACE_NAME_MAX_LENGTH, {
    error: `Название не длиннее ${WORKSPACE_NAME_MAX_LENGTH} символов`,
  });

/** Пустой slug → undefined: сервер сгенерирует его из названия. */
const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .transform((value) => (value ? value : undefined))
  .superRefine((value, ctx) => {
    const problem = value === undefined ? null : slugProblem(value);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });

export const createWorkspaceSchema = z.object({ name: nameField, slug: slugField });

export const renameWorkspaceSchema = z.object({ workspaceId: workspaceIdField, name: nameField });

export const deleteWorkspaceSchema = z.object({
  workspaceId: workspaceIdField,
  confirmName: z.string({ error: 'Введите название пространства' }).trim().min(1, {
    error: 'Введите название пространства',
  }),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type RenameWorkspaceInput = z.infer<typeof renameWorkspaceSchema>;
export type DeleteWorkspaceInput = z.infer<typeof deleteWorkspaceSchema>;
