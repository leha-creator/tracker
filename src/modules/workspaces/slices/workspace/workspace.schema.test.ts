import { describe, expect, it } from 'vitest';

import {
  createWorkspaceSchema,
  deleteWorkspaceSchema,
  renameWorkspaceSchema,
} from './workspace.schema';

describe('createWorkspaceSchema', () => {
  it('trims name and turns empty slug into undefined', () => {
    expect(createWorkspaceSchema.parse({ name: '  Отдел продаж ', slug: '' })).toEqual({
      name: 'Отдел продаж',
      slug: undefined,
    });
  });

  it('normalizes slug case', () => {
    expect(createWorkspaceSchema.parse({ name: 'Team', slug: ' My-Team ' }).slug).toBe('my-team');
  });

  it.each(['my_team', 'new', 'ab', '-team'])('rejects slug %s', (slug) => {
    const result = createWorkspaceSchema.safeParse({ name: 'Team', slug });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['slug']);
  });

  it('rejects too short and too long names', () => {
    expect(createWorkspaceSchema.safeParse({ name: 'A' }).success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ name: 'x'.repeat(81) }).success).toBe(false);
  });
});

describe('renameWorkspaceSchema / deleteWorkspaceSchema', () => {
  it('require workspaceId', () => {
    expect(renameWorkspaceSchema.safeParse({ name: 'Team' }).success).toBe(false);
    expect(deleteWorkspaceSchema.safeParse({ confirmName: 'Team' }).success).toBe(false);
  });

  it('requires confirmName for delete', () => {
    expect(
      deleteWorkspaceSchema.safeParse({ workspaceId: 'ws-1', confirmName: '  ' }).success,
    ).toBe(false);
  });
});
