import { ConflictError, ValidationError } from '@/shared/errors/app-error';

import { positionBetween } from './position';
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

/** Карточка колонки: id задачи и позиция. */
export interface ColumnCard {
  taskId: string;
  position: string;
}

export type MovePosition =
  | { kind: 'noop' }
  | { kind: 'position'; position: string }
  /** Соседи с равными ключами — колонку нужно перенумеровать и вычислить позицию заново. */
  | { kind: 'rekey' };

/**
 * Позиция карточки `taskId` в колонке сразу под `prevTaskId` (null — верх колонки).
 * `column` — целевая колонка, отсортированная `comparePositions`; может содержать саму карточку
 * (перестановка внутри колонки). Якорь, которого нет в колонке, — устаревшая доска (CONFLICT).
 */
export function resolveMovePosition(input: {
  column: readonly ColumnCard[];
  taskId: string;
  prevTaskId: string | null;
}): MovePosition {
  const { column, taskId, prevTaskId } = input;
  if (prevTaskId === taskId) {
    throw new ValidationError('Карточку нельзя поставить относительно самой себя');
  }

  const ownIndex = column.findIndex((card) => card.taskId === taskId);
  if (ownIndex !== -1 && (column[ownIndex - 1]?.taskId ?? null) === prevTaskId) {
    return { kind: 'noop' };
  }

  const rest = ownIndex === -1 ? column : column.filter((card) => card.taskId !== taskId);
  const prevIndex = prevTaskId === null ? -1 : rest.findIndex((card) => card.taskId === prevTaskId);
  if (prevTaskId !== null && prevIndex === -1) {
    throw new ConflictError('Доска изменилась, порядок обновлён');
  }

  const before = prevIndex === -1 ? null : rest[prevIndex]!.position;
  const after = rest[prevIndex + 1]?.position ?? null;
  if (before !== null && before === after) return { kind: 'rekey' };
  return { kind: 'position', position: positionBetween(before, after) };
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
