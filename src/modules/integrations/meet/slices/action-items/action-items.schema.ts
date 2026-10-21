import { z } from 'zod';

export const createSubtasksSchema = z.object({
  workspaceId: z.string({ error: 'Не указано пространство' }).min(1).max(64),
  recapId: z.uuid({ error: 'Не указан конспект' }),
  items: z
    .array(
      z.object({
        index: z.number().int().min(0).max(49),
        assigneeId: z.string().min(1).max(64).nullish(),
      }),
    )
    .min(1, { error: 'Выберите поручения' })
    .max(50),
});
