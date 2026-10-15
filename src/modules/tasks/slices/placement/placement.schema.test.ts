import { describe, expect, it } from 'vitest';

import {
  addToProjectSchema,
  movePlacementSchema,
  removeFromProjectSchema,
} from './placement.schema';

const ref = {
  workspaceId: 'ws',
  taskId: '0192f3a0-0000-7000-8000-000000000010',
  projectId: '0192f3a0-0000-7000-8000-000000000001',
};

describe('addToProjectSchema', () => {
  it('accepts a valid placement', () => {
    expect(
      addToProjectSchema.safeParse({ ...ref, statusId: '0192f3a0-0000-7000-8000-0000000000a1' })
        .success,
    ).toBe(true);
  });

  it('requires a status with a readable message', () => {
    const result = addToProjectSchema.safeParse({ ...ref, statusId: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Выберите статус');
  });

  it('requires a project', () => {
    expect(removeFromProjectSchema.safeParse({ ...ref, projectId: '' }).success).toBe(false);
  });
});

describe('movePlacementSchema', () => {
  const move = { ...ref, statusId: '0192f3a0-0000-7000-8000-0000000000a1' };

  it('accepts the top of the column (null anchor)', () => {
    expect(movePlacementSchema.safeParse({ ...move, prevTaskId: null }).success).toBe(true);
  });

  it('accepts an anchor card', () => {
    expect(
      movePlacementSchema.safeParse({ ...move, prevTaskId: '0192f3a0-0000-7000-8000-000000000011' })
        .success,
    ).toBe(true);
  });

  it('requires the anchor to be explicit', () => {
    expect(movePlacementSchema.safeParse(move).success).toBe(false);
  });

  it('rejects a malformed anchor', () => {
    expect(movePlacementSchema.safeParse({ ...move, prevTaskId: 'abc' }).success).toBe(false);
  });
});
