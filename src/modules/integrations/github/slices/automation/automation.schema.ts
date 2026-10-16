import { z } from 'zod';

/** Значение селекта «Не менять» (Radix не допускает пустой пункт). */
export const KEEP_STATUS = 'none';

/** «Не менять» или пусто → null. */
const statusField = z
  .string()
  .optional()
  .transform((value) => (value && value !== KEEP_STATUS ? value : null));

export const updateProjectAutomationSchema = z.object({
  workspaceId: z.string({ error: 'Не указано пространство' }).min(1),
  projectId: z.string({ error: 'Не указан проект' }).min(1),
  prOpenedStatusId: statusField,
  prMergedStatusId: statusField,
});

export type UpdateProjectAutomationInput = z.infer<typeof updateProjectAutomationSchema>;
