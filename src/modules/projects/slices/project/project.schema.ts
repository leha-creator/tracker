import { z } from 'zod';

import {
  normalizeProjectName,
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_NAME_MIN_LENGTH,
} from '../../models/project';

export const workspaceIdField = z.string({ error: 'Не указано пространство' }).min(1);

/** id проекта или статуса из формы или URL. */
export const entityIdField = z.uuid({ error: 'Некорректный идентификатор' });

/** Параметр `[projectId]` страницы: невалидный UUID → 404 без запроса к БД. */
export const projectIdSchema = entityIdField;

const nameField = z
  .string({ error: 'Укажите название' })
  .transform(normalizeProjectName)
  .pipe(
    z
      .string()
      .min(PROJECT_NAME_MIN_LENGTH, {
        error: `Название не короче ${PROJECT_NAME_MIN_LENGTH} символов`,
      })
      .max(PROJECT_NAME_MAX_LENGTH, {
        error: `Название не длиннее ${PROJECT_NAME_MAX_LENGTH} символов`,
      }),
  );

/** Пустое описание → undefined (в БД — null). */
const descriptionField = z
  .string()
  .trim()
  .max(PROJECT_DESCRIPTION_MAX_LENGTH, {
    error: `Описание не длиннее ${PROJECT_DESCRIPTION_MAX_LENGTH} символов`,
  })
  .optional()
  .transform((value) => (value ? value : undefined));

export const createProjectSchema = z.object({
  workspaceId: workspaceIdField,
  name: nameField,
  description: descriptionField,
});

export const updateProjectSchema = createProjectSchema.extend({ projectId: entityIdField });

export const deleteProjectSchema = z.object({
  workspaceId: workspaceIdField,
  projectId: entityIdField,
  confirmName: z.string({ error: 'Введите название проекта' }).trim().min(1, {
    error: 'Введите название проекта',
  }),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type DeleteProjectInput = z.infer<typeof deleteProjectSchema>;
