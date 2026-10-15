import { describe, expect, it } from 'vitest';

import { TASK_PLACEMENT_LIMIT } from './task';
import {
  assertCanPlace,
  resolveMovePosition,
  TaskPlacement,
  type MovePosition,
} from './task-placement';

describe('TaskPlacement.moveTo', () => {
  it('moves to a status of the same project', () => {
    const placement = new TaskPlacement('t1', 'p1', 's1', 'a0');
    placement.moveTo({ statusId: 's2', statusProjectId: 'p1', position: 'a1' });
    expect(placement.statusId).toBe('s2');
    expect(placement.position).toBe('a1');
  });

  it('rejects a status of another project', () => {
    const placement = new TaskPlacement('t1', 'p1', 's1', 'a0');
    expect(() =>
      placement.moveTo({ statusId: 's9', statusProjectId: 'p2', position: 'a1' }),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(placement.statusId).toBe('s1');
  });
});

describe('assertCanPlace', () => {
  it('allows a new project', () => {
    expect(() => assertCanPlace(['p1'], 'p2')).not.toThrow();
  });

  it('rejects a duplicate project', () => {
    expect(() => assertCanPlace(['p1', 'p2'], 'p2')).toThrow(
      expect.objectContaining({ code: 'CONFLICT' }),
    );
  });

  it('rejects above the limit', () => {
    const ids = Array.from({ length: TASK_PLACEMENT_LIMIT }, (_, i) => `p${i}`);
    expect(() => assertCanPlace(ids, 'new')).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
    expect(() => assertCanPlace(ids.slice(1), 'new')).not.toThrow();
  });
});

describe('resolveMovePosition', () => {
  const column = [
    { taskId: 'a', position: 'a0' },
    { taskId: 'b', position: 'a1' },
    { taskId: 'c', position: 'a2' },
  ];

  function positionOf(result: MovePosition): string {
    if (result.kind !== 'position') throw new Error(`expected position, got ${result.kind}`);
    return result.position;
  }

  it('places a card at the top of the column', () => {
    expect(positionOf(resolveMovePosition({ column, taskId: 'x', prevTaskId: null })) < 'a0').toBe(
      true,
    );
  });

  it('places a card at the bottom of the column', () => {
    expect(positionOf(resolveMovePosition({ column, taskId: 'x', prevTaskId: 'c' })) > 'a2').toBe(
      true,
    );
  });

  it('places a card between neighbours', () => {
    const position = positionOf(resolveMovePosition({ column, taskId: 'x', prevTaskId: 'a' }));
    expect('a0' < position && position < 'a1').toBe(true);
  });

  it('places a card into an empty column', () => {
    expect(positionOf(resolveMovePosition({ column: [], taskId: 'x', prevTaskId: null }))).toEqual(
      expect.any(String),
    );
  });

  it('moves a card down within its column, skipping its own key', () => {
    const position = positionOf(resolveMovePosition({ column, taskId: 'a', prevTaskId: 'b' }));
    expect('a1' < position && position < 'a2').toBe(true);
  });

  it('returns noop when the card already stands under the anchor', () => {
    expect(resolveMovePosition({ column, taskId: 'b', prevTaskId: 'a' })).toEqual({
      kind: 'noop',
    });
    expect(resolveMovePosition({ column, taskId: 'a', prevTaskId: null })).toEqual({
      kind: 'noop',
    });
  });

  it('rejects a stale anchor', () => {
    expect(() => resolveMovePosition({ column, taskId: 'x', prevTaskId: 'gone' })).toThrow(
      expect.objectContaining({ code: 'CONFLICT' }),
    );
  });

  it('rejects the card itself as the anchor', () => {
    expect(() => resolveMovePosition({ column, taskId: 'a', prevTaskId: 'a' })).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('asks to rekey when neighbours share a key', () => {
    const raced = [
      { taskId: 'a', position: 'a0' },
      { taskId: 'b', position: 'a0' },
    ];
    expect(resolveMovePosition({ column: raced, taskId: 'x', prevTaskId: 'a' })).toEqual({
      kind: 'rekey',
    });
  });
});
