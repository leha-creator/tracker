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

/** Перенос карточки на доске: `prevTaskId` — карточка прямо над местом броска, null — верх колонки. */
export const movePlacementSchema = addToProjectSchema.extend({
  prevTaskId: z.uuid().nullable(),
});
