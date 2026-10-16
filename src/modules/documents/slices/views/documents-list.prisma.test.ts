import { describe, expect, it } from 'vitest';

import { defaultDocumentListQuery } from '../../models';
import { buildDocumentOrderBy, buildDocumentWhere } from './documents-list.prisma';

const FOLDER = '0199f3a4-1b2c-7d3e-8f40-0000000000f1';
const TAG = '0199f3a4-1b2c-7d3e-8f40-0000000000a1';
const VISIBLE = { OR: [{ kind: 'note' }, { status: 'ready' }] };

describe('buildDocumentWhere', () => {
  it('browses one folder (root by default) and hides pending uploads', () => {
    expect(buildDocumentWhere(defaultDocumentListQuery(), 'ws-1')).toEqual({
      workspaceId: 'ws-1',
      AND: [VISIBLE, { folderId: null }],
    });
    expect(
      buildDocumentWhere({ ...defaultDocumentListQuery(), folder: FOLDER }, 'ws-1').AND,
    ).toEqual([VISIBLE, { folderId: FOLDER }]);
  });

  it('searches the whole workspace by title, tag and kind', () => {
    const where = buildDocumentWhere(
      { ...defaultDocumentListQuery(), folder: FOLDER, q: 'Регламент', tag: TAG, kind: 'pdf' },
      'ws-1',
    );
    expect(where.workspaceId).toBe('ws-1');
    expect(where.AND).toEqual([
      VISIBLE,
      { titleKey: { contains: 'регламент' } },
      { tags: { some: { tagId: TAG } } },
      { kind: 'file', extension: { in: ['pdf'] } },
    ]);
  });

  it('maps note and other kind filters', () => {
    expect(
      buildDocumentWhere({ ...defaultDocumentListQuery(), kind: 'note' }, 'ws').AND,
    ).toContainEqual({ kind: 'note' });
    const other = buildDocumentWhere({ ...defaultDocumentListQuery(), kind: 'other' }, 'ws');
    expect(other.AND).toContainEqual({
      kind: 'file',
      extension: { notIn: expect.arrayContaining(['png', 'pdf', 'md', 'mp4']) as string[] },
    });
  });
});

describe('buildDocumentOrderBy', () => {
  it('sorts by the chosen field with id as a tie-breaker', () => {
    expect(buildDocumentOrderBy('name', 'asc')).toEqual([{ titleKey: 'asc' }, { id: 'asc' }]);
    expect(buildDocumentOrderBy('updated', 'desc')).toEqual([
      { updatedAt: 'desc' },
      { id: 'desc' },
    ]);
  });
});
