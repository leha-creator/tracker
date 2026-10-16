import { describe, expect, it } from 'vitest';

import { searchParentSchema, setTaskParentSchema } from './subtask.schema';

const TASK = '0192f3a0-0000-7000-8000-000000000002';
const PARENT = '0192f3a0-0000-7000-8000-000000000001';

describe('setTaskParentSchema', () => {
  it.each([
    ['', null],
    [null, null],
    [undefined, null],
    [PARENT, PARENT],
  ])('parentId %j → %j', (parentId, expected) => {
    expect(
      setTaskParentSchema.parse({ workspaceId: 'ws-1', taskId: TASK, parentId }).parentId,
    ).toBe(expected);
  });

  it('rejects a malformed parent id', () => {
    expect(
      setTaskParentSchema.safeParse({ workspaceId: 'ws-1', taskId: TASK, parentId: 'abc' }).success,
    ).toBe(false);
  });
});

describe('searchParentSchema', () => {
  it('trims the query and drops a too long one', () => {
    expect(searchParentSchema.parse({ workspaceId: 'ws-1', taskId: TASK, q: '  вход ' }).q).toBe(
      'вход',
    );
    expect(
      searchParentSchema.parse({ workspaceId: 'ws-1', taskId: TASK, q: 'x'.repeat(101) }).q,
    ).toBe('');
  });
});
