import { describe, expect, it } from 'vitest';

import { addStatusSchema, moveStatusSchema } from './status.schema';

const ref = { workspaceId: 'ws', projectId: '0192f3a0-0000-7000-8000-000000000001' };
const STATUS_ID = '0192f3a0-0000-7000-8000-0000000000a1';

describe('addStatusSchema', () => {
  it('accepts a valid status and trims name', () => {
    expect(
      addStatusSchema.parse({
        ...ref,
        name: ' На проверке ',
        category: 'in_progress',
        color: 'amber',
      }).name,
    ).toBe('На проверке');
  });

  it.each([
    ['category', { category: 'archived', color: 'gray' }],
    ['color', { category: 'todo', color: 'pink' }],
  ])('rejects unknown %s', (_field, extra) => {
    expect(addStatusSchema.safeParse({ ...ref, name: 'X', ...extra }).success).toBe(false);
  });

  it('rejects empty name', () => {
    expect(
      addStatusSchema.safeParse({ ...ref, name: '   ', category: 'todo', color: 'gray' }).success,
    ).toBe(false);
  });
});

describe('moveStatusSchema', () => {
  it.each(['up', 'down'])('accepts direction %s', (direction) => {
    expect(moveStatusSchema.safeParse({ ...ref, statusId: STATUS_ID, direction }).success).toBe(
      true,
    );
  });

  it('rejects unknown direction', () => {
    expect(
      moveStatusSchema.safeParse({ ...ref, statusId: STATUS_ID, direction: 'left' }).success,
    ).toBe(false);
  });
});
