import { z } from 'zod';

import { entityIdField, workspaceIdField } from '../task/task.schema';

const placementRef = {
  workspaceId: workspaceIdField,
  taskId: entityIdField,
  projectId: z.uuid({ error: 'Выберите проект' }),
};

export const addToProjectSchema = z.object({
  ...placementRef,
  statusId: z.uuid({ error: 'Выберите статус' }),
});

export const changeStatusSchema = addToProjectSchema;

export const removeFromProjectSchema = z.object(placementRef);
