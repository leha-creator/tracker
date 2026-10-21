import { describe, expect, it } from 'vitest';

import { encodeAuditCursor, parseAuditCursor } from './audit-cursor';
import {
  auditPeriodBounds,
  hasActiveAuditFilters,
  parseAdminAuditParams,
  serializeAdminAuditParams,
} from './audit-query';

const ID = '0199f0d2-7c3a-7b1e-9a4f-1c2d3e4f5a6b';

describe('parseAdminAuditParams', () => {
  it('keeps valid filters', () => {
    const query = parseAdminAuditParams({
      user: 'u1',
      category: 'security',
      kind: 'auth.sign_in',
      workspace: 'w1',
      from: '2026-10-01',
      to: '2026-10-19',
    });
    expect(query).toMatchObject({
      userId: 'u1',
      category: 'security',
      kind: 'auth.sign_in',
      workspaceId: 'w1',
      from: '2026-10-01',
      to: '2026-10-19',
      cursor: { local: null, remote: null },
    });
    expect(hasActiveAuditFilters(query)).toBe(true);
  });

  it('drops invalid values', () => {
    const query = parseAdminAuditParams({
      user: 'x'.repeat(65),
      category: 'secret',
      kind: 'toString',
      from: '2026-13-45',
      to: 'yesterday',
      cursor: 'garbage',
    });
    expect(query).toEqual({
      userId: null,
      category: null,
      kind: null,
      workspaceId: null,
      from: null,
      to: null,
      cursor: { local: null, remote: null },
    });
    expect(hasActiveAuditFilters(query)).toBe(false);
  });

  it('serializes filters without the cursor', () => {
    const query = parseAdminAuditParams({ user: 'u1', kind: 'auth.sign_in' });
    expect(serializeAdminAuditParams(query).toString()).toBe('user=u1&kind=auth.sign_in');
  });
});

describe('auditPeriodBounds', () => {
  it('includes the whole last day', () => {
    expect(auditPeriodBounds({ from: '2026-10-01', to: '2026-10-19' })).toEqual({
      gte: new Date('2026-10-01T00:00:00.000Z'),
      lt: new Date('2026-10-20T00:00:00.000Z'),
    });
  });
});

describe('audit cursor', () => {
  it('round-trips', () => {
    const cursor = { createdAt: new Date('2026-10-19T10:00:00.000Z'), id: ID };
    expect(parseAuditCursor(encodeAuditCursor(cursor))).toEqual(cursor);
  });

  it('rejects malformed cursors', () => {
    expect(parseAuditCursor('2026-10-19_not-a-uuid')).toBeNull();
    expect(parseAuditCursor(42)).toBeNull();
  });
});
