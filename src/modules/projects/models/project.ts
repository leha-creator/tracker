import { ValidationError } from '@/shared/errors/app-error';

export const PROJECT_NAME_MIN_LENGTH = 2;
export const PROJECT_NAME_MAX_LENGTH = 80;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 2000;
/** Максимум проектов в одном пространстве. */
export const PROJECT_LIMIT = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * id проекта и статуса — UUID. Строку другого вида отсекаем до запроса:
 * Postgres не приведёт её к uuid и вернёт ошибку вместо «не найдено».
 */
export function isEntityId(value: string): boolean {
  return UUID_RE.test(value);
}

/** Название проекта без пробелов по краям и с одиночными пробелами внутри. */
export function normalizeProjectName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Удаление проекта подтверждается вводом его названия. */
export function assertDeleteConfirmed(projectName: string, confirmName: string): void {
  if (normalizeProjectName(confirmName) !== projectName) {
    throw new ValidationError('Название не совпадает', {
      fieldErrors: { confirmName: ['Введите название проекта точно'] },
    });
  }
}

/** Нельзя создать проект сверх лимита пространства. */
export function assertCanCreateProject(projectsCount: number): void {
  if (projectsCount >= PROJECT_LIMIT) {
    throw new ValidationError(`В пространстве может быть не больше ${PROJECT_LIMIT} проектов`);
  }
}

export const ARCHIVED_PROJECT_MESSAGE = 'Проект в архиве — восстановите его, чтобы изменить';

/** Архивный проект только для чтения: доска, статусы и размещения не меняются. */
export function assertProjectNotArchived(project: { archivedAt: Date | null }): void {
  if (project.archivedAt) throw new ValidationError(ARCHIVED_PROJECT_MESSAGE);
}

/** Удалить навсегда можно только архивный проект. */
export function assertCanDeleteProject(project: { archivedAt: Date | null }): void {
  if (!project.archivedAt) {
    throw new ValidationError('Удалить навсегда можно только проект из архива');
  }
}
