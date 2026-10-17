import { z } from 'zod';

import { entityIdField, workspaceIdField } from '../task/task.schema';

export const watchTaskSchema = z.object({
  workspaceId: workspaceIdField,
  taskId: entityIdField,
  watch: z.boolean(),
});
