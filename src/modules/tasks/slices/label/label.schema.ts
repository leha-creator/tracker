import { z } from 'zod';

import { TASK_LABEL_COLORS, TASK_LABELS_PER_TASK } from '../../models';
import { entityIdField, workspaceIdField } from '../task/task.schema';

/** Имя проверяет и нормализует модель (`normalizeLabelName`) — с ошибкой поля `name`. */
const nameField = z.string({ error: 'Введите название метки' });
const colorField = z.enum(TASK_LABEL_COLORS, { error: 'Недопустимый цвет' }).default('gray');

export const createLabelSchema = z.object({
  workspaceId: workspaceIdField,
  name: nameField,
  color: colorField,
});

export const updateLabelSchema = createLabelSchema.extend({ labelId: entityIdField });

export const deleteLabelSchema = z.object({
  workspaceId: workspaceIdField,
  labelId: entityIdField,
});

/** Метки задачи целиком (лимит проверяет модель — с понятной ошибкой). */
export const setTaskLabelsSchema = z.object({
  workspaceId: workspaceIdField,
  taskId: entityIdField,
  labelIds: z.array(entityIdField).max(TASK_LABELS_PER_TASK * 5),
});
