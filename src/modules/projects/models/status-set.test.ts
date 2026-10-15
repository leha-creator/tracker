import { describe, expect, it } from 'vitest';

import { STATUS_LIMIT, StatusSet } from './status-set';

function persisted() {
  // Порядок строк намеренно перемешан: набор сортирует по position.
  return StatusSet.fromPersisted([
    { id: 's-2', name: 'В работе', category: 'in_progress', color: 'blue', position: 1 },
    { id: 's-1', name: 'К выполнению', category: 'todo', color: 'gray', position: 0 },
    { id: 's-3', name: 'Готово', category: 'done', color: 'green', position: 2 },
  ]);
}

const ids = (set: StatusSet) => set.statuses.map((status) => status.id);

describe('StatusSet.createDefault', () => {
  it('creates three new statuses todo → in_progress → done', () => {
    const set = StatusSet.createDefault();
    expect(set.statuses).toEqual([
      { id: null, name: 'К выполнению', category: 'todo', color: 'gray', position: 0 },
      { id: null, name: 'В работе', category: 'in_progress', color: 'blue', position: 1 },
      { id: null, name: 'Готово', category: 'done', color: 'green', position: 2 },
    ]);
  });
});

describe('StatusSet.fromPersisted', () => {
  it('orders statuses by position', () => {
    expect(ids(persisted())).toEqual(['s-1', 's-2', 's-3']);
  });
});

describe('StatusSet.add', () => {
  it('appends a status with normalized name at the end', () => {
    const set = persisted();
    set.add({ name: '  На   проверке ', category: 'in_progress', color: 'amber' });
    expect(set.statuses.at(-1)).toEqual({
      id: null,
      name: 'На проверке',
      category: 'in_progress',
      color: 'amber',
      position: 3,
    });
  });

  it('rejects duplicate name ignoring case', () => {
    const set = persisted();
    expect(() => set.add({ name: 'готово', category: 'done', color: 'gray' })).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR', fieldErrors: expect.any(Object) }),
    );
  });

  it.each(['', '   ', 'x'.repeat(41)])('rejects invalid name %j', (name) => {
    expect(() => persisted().add({ name, category: 'todo', color: 'gray' })).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it(`rejects more than ${STATUS_LIMIT} statuses`, () => {
    const set = persisted();
    for (let i = 3; i < STATUS_LIMIT; i++) {
      set.add({ name: `Статус ${i}`, category: 'todo', color: 'gray' });
    }
    expect(set.statuses).toHaveLength(STATUS_LIMIT);
    expect(() => set.add({ name: 'Лишний', category: 'todo', color: 'gray' })).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });
});

describe('StatusSet.update', () => {
  it('renames keeping the same name in other case allowed for itself', () => {
    const set = persisted();
    set.update('s-3', { name: 'ГОТОВО' });
    expect(set.statuses[2]).toMatchObject({ id: 's-3', name: 'ГОТОВО', category: 'done' });
  });

  it('changes category and color without touching name', () => {
    const set = persisted();
    set.update('s-1', { category: 'in_progress', color: 'violet' });
    expect(set.statuses[0]).toMatchObject({
      name: 'К выполнению',
      category: 'in_progress',
      color: 'violet',
    });
  });

  it('rejects name of another status', () => {
    expect(() => persisted().update('s-1', { name: 'в работе' })).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('throws NOT_FOUND for unknown id', () => {
    expect(() => persisted().update('s-x', { name: 'X' })).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });
});

describe('StatusSet.move', () => {
  it('moves a status up and down', () => {
    const set = persisted();
    expect(set.move('s-2', 'up')).toBe(true);
    expect(ids(set)).toEqual(['s-2', 's-1', 's-3']);
    expect(set.move('s-2', 'down')).toBe(true);
    expect(ids(set)).toEqual(['s-1', 's-2', 's-3']);
    expect(set.statuses.map((status) => status.position)).toEqual([0, 1, 2]);
  });

  it('is a no-op at the boundaries', () => {
    const set = persisted();
    expect(set.move('s-1', 'up')).toBe(false);
    expect(set.move('s-3', 'down')).toBe(false);
    expect(ids(set)).toEqual(['s-1', 's-2', 's-3']);
  });
});

describe('StatusSet.remove', () => {
  it('removes from the middle and renormalizes positions', () => {
    const set = persisted();
    set.remove('s-2');
    expect(set.statuses.map(({ id, position }) => ({ id, position }))).toEqual([
      { id: 's-1', position: 0 },
      { id: 's-3', position: 1 },
    ]);
    expect(set.removedIds).toEqual(['s-2']);
  });

  it('refuses to remove the last status', () => {
    const set = persisted();
    set.remove('s-1');
    set.remove('s-2');
    expect(() => set.remove('s-3')).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(ids(set)).toEqual(['s-3']);
  });

  it('removes an empty status without a move target', () => {
    expect(persisted().remove('s-1', { tasksCount: 0 })).toBeNull();
  });

  it('requires a move target when the status has tasks', () => {
    const set = persisted();
    expect(() => set.remove('s-1', { tasksCount: 2 })).toThrow(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        fieldErrors: { moveToStatusId: expect.any(Array) },
      }),
    );
    expect(set.removedIds).toEqual([]);
  });

  it('rejects moving tasks into the removed status', () => {
    expect(() => persisted().remove('s-1', { tasksCount: 1, moveToId: 's-1' })).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('rejects a move target outside the set', () => {
    expect(() => persisted().remove('s-1', { tasksCount: 1, moveToId: 'foreign' })).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });

  it('returns the move target', () => {
    const set = persisted();
    expect(set.remove('s-1', { tasksCount: 1, moveToId: 's-3' })).toBe('s-3');
    expect(ids(set)).toEqual(['s-2', 's-3']);
  });
});
