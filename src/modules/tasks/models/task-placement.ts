import { ConflictError, ValidationError } from '@/shared/errors/app-error';

import { TASK_PLACEMENT_LIMIT } from './task';

/**
 * Размещение задачи в проекте: статус и позиция в колонке. Единственный источник статуса задачи.
 * Инвариант: статус принадлежит проекту размещения (дублируется составным FK в БД).
 */
export class TaskPlacement {
  constructor(
    readonly taskId: string,
    readonly projectId: string,
    private _statusId: string,
    private _position: string,
  ) {}

  get statusId(): string {
    return this._statusId;
  }

  get position(): string {
    return this._position;
  }

  moveTo(target: { statusId: string; statusProjectId: string; position: string }): void {
    if (target.statusProjectId !== this.projectId) {
      throw new ValidationError('Статус не принадлежит проекту этого размещения', {
        fieldErrors: { statusId: ['Выберите статус этого проекта'] },
      });
    }
    this._statusId = target.statusId;
    this._position = target.position;
  }
}

/** Задачу можно добавить в проект, если её там ещё нет и не превышен лимит размещений. */
export function assertCanPlace(existingProjectIds: readonly string[], projectId: string): void {
  if (existingProjectIds.includes(projectId)) {
    throw new ConflictError('Задача уже есть в этом проекте', {
      fieldErrors: { projectId: ['Задача уже есть в этом проекте'] },
    });
  }
  if (existingProjectIds.length >= TASK_PLACEMENT_LIMIT) {
    throw new ValidationError(
      `Задача может быть не больше чем в ${TASK_PLACEMENT_LIMIT} проектах одновременно`,
    );
  }
}
