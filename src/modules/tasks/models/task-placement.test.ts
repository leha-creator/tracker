import { describe, expect, it } from 'vitest';

import { TASK_PLACEMENT_LIMIT } from './task';
import { assertCanPlace, TaskPlacement } from './task-placement';

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
