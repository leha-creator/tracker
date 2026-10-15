import { NotFoundError, ValidationError } from '@/shared/errors/app-error';

import type { StatusCategory } from './status-category';
import type { StatusColor } from './status-color';

/** Максимум статусов (колонок) в проекте. */
export const STATUS_LIMIT = 20;
export const STATUS_NAME_MAX_LENGTH = 40;

export type StatusDirection = 'up' | 'down';

export interface StatusFields {
  name: string;
  category: StatusCategory;
  color: StatusColor;
}

/** Статус в наборе. `id: null` — новый, ещё не сохранённый статус. */
export interface StatusItem extends StatusFields {
  id: string | null;
}

export interface PositionedStatus extends StatusItem {
  position: number;
}

const DEFAULT_STATUSES: readonly StatusFields[] = [
  { name: 'К выполнению', category: 'todo', color: 'gray' },
  { name: 'В работе', category: 'in_progress', color: 'blue' },
  { name: 'Готово', category: 'done', color: 'green' },
];

function normalizeStatusName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Упорядоченный набор статусов проекта. Инварианты: хотя бы один статус, не больше
 * STATUS_LIMIT, имена уникальны без учёта регистра, позиции — всегда 0..n-1 по порядку.
 */
export class StatusSet {
  private readonly removed: string[] = [];

  private constructor(private items: StatusItem[]) {}

  /** Набор по умолчанию для нового проекта. */
  static createDefault(): StatusSet {
    return new StatusSet(DEFAULT_STATUSES.map((status) => ({ id: null, ...status })));
  }

  /** Набор из сохранённых строк (порядок — по `position`). */
  static fromPersisted(
    rows: readonly (StatusFields & { id: string; position: number })[],
  ): StatusSet {
    const sorted = [...rows].sort((a, b) => a.position - b.position);
    return new StatusSet(
      sorted.map(({ id, name, category, color }) => ({ id, name, category, color })),
    );
  }

  /** Статусы по порядку с нормализованными позициями. */
  get statuses(): PositionedStatus[] {
    return this.items.map((item, position) => ({ ...item, position }));
  }

  /** id сохранённых статусов, удалённых из набора. */
  get removedIds(): readonly string[] {
    return this.removed;
  }

  add(fields: StatusFields): void {
    if (this.items.length >= STATUS_LIMIT) {
      throw new ValidationError(`В проекте может быть не больше ${STATUS_LIMIT} статусов`);
    }
    const name = this.checkName(fields.name, null);
    this.items.push({ id: null, name, category: fields.category, color: fields.color });
  }

  update(id: string, fields: Partial<StatusFields>): void {
    const index = this.indexOf(id);
    const current = this.items[index]!;
    const name = fields.name === undefined ? current.name : this.checkName(fields.name, id);
    this.items[index] = {
      ...current,
      name,
      category: fields.category ?? current.category,
      color: fields.color ?? current.color,
    };
  }

  /** Сдвигает статус на одну позицию. У границы ничего не меняется — возвращает false. */
  move(id: string, direction: StatusDirection): boolean {
    const index = this.indexOf(id);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= this.items.length) return false;
    const items = [...this.items];
    [items[index], items[target]] = [items[target]!, items[index]!];
    this.items = items;
    return true;
  }

  remove(id: string): void {
    const index = this.indexOf(id);
    if (this.items.length <= 1) {
      throw new ValidationError('В проекте должен остаться хотя бы один статус');
    }
    this.items = this.items.filter((_, i) => i !== index);
    this.removed.push(id);
  }

  private indexOf(id: string): number {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) throw new NotFoundError('Статус не найден');
    return index;
  }

  private checkName(raw: string, selfId: string | null): string {
    const name = normalizeStatusName(raw);
    if (name.length === 0 || name.length > STATUS_NAME_MAX_LENGTH) {
      throw new ValidationError('Некорректное название статуса', {
        fieldErrors: { name: [`От 1 до ${STATUS_NAME_MAX_LENGTH} символов`] },
      });
    }
    const lower = name.toLocaleLowerCase('ru');
    const duplicate = this.items.some(
      (item) => item.id !== selfId && item.name.toLocaleLowerCase('ru') === lower,
    );
    if (duplicate) {
      throw new ValidationError('Статус с таким названием уже есть', {
        fieldErrors: { name: ['Статус с таким названием уже есть в проекте'] },
      });
    }
    return name;
  }
}
