import { z } from 'zod';

export const startTaskMeetingSchema = z.object({
  workspaceId: z.string({ error: 'Не указано пространство' }).min(1).max(64),
  taskId: z.uuid({ error: 'Не указана задача' }),
});
