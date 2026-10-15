import { z } from 'zod';

import { STATUS_CATEGORIES } from '../../models/status-category';
import { STATUS_COLORS } from '../../models/status-color';
import { STATUS_NAME_MAX_LENGTH } from '../../models/status-set';
import { entityIdField, workspaceIdField } from '../project/project.schema';

const projectRef = { workspaceId: workspaceIdField, projectId: entityIdField };

const nameField = z
  .string({ error: 'Укажите название' })
  .trim()
  .min(1, { error: 'Укажите название' })
  .max(STATUS_NAME_MAX_LENGTH, {
    error: `Название не длиннее ${STATUS_NAME_MAX_LENGTH} символов`,
  });

const categoryField = z.enum(STATUS_CATEGORIES, { error: 'Недопустимая категория' });
const colorField = z.enum(STATUS_COLORS, { error: 'Недопустимый цвет' });

export const addStatusSchema = z.object({
  ...projectRef,
  name: nameField,
  category: categoryField,
  color: colorField,
});

export const updateStatusSchema = addStatusSchema.extend({ statusId: entityIdField });

export const moveStatusSchema = z.object({
  ...projectRef,
  statusId: entityIdField,
  direction: z.enum(['up', 'down'], { error: 'Недопустимое направление' }),
});

export const deleteStatusSchema = z.object({ ...projectRef, statusId: entityIdField });

export type AddStatusInput = z.infer<typeof addStatusSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type MoveStatusInput = z.infer<typeof moveStatusSchema>;
