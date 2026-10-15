import { describe, expect, it } from 'vitest';

import { addToProjectSchema, removeFromProjectSchema } from './placement.schema';

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
