import { describe, expect, it } from 'vitest';

import {
  AUDIT_EVENT_KINDS,
  AUDIT_EVENT_OWNERS,
  AUDIT_EVENTS,
  auditCategoryOf,
  auditKindsOfCategory,
  auditOwnerOf,
  auditVisibilityOf,
  isAuditEventKind,
} from './audit-catalog';

describe('audit catalog', () => {
  it('gives every kind a category matching its prefix group', () => {
    for (const kind of AUDIT_EVENT_KINDS) {
      const category = auditCategoryOf(kind);
      if (kind.startsWith('auth.') || kind.startsWith('token.')) expect(category).toBe('security');
      if (kind.startsWith('admin.')) expect(category).toBe('admin');
      if (kind.startsWith('task.') || kind.startsWith('document.'))
        expect(category).toBe('content');
    }
  });

  it('keeps security events private to the user and admin events to admins', () => {
    expect(auditVisibilityOf('auth.sign_in')).toBe('self');
    expect(auditVisibilityOf('token.issued')).toBe('self');
    expect(auditVisibilityOf('admin.user_banned')).toBe('admin');
    expect(auditVisibilityOf('task.created')).toBe('workspace');
    expect(auditVisibilityOf('workspace.member_removed')).toBe('workspace');
  });

  it('names an owner for every kind: account events belong to identity (future IdP)', () => {
    expect(Object.keys(AUDIT_EVENT_OWNERS).sort()).toEqual([...AUDIT_EVENT_KINDS].sort());
    for (const kind of AUDIT_EVENT_KINDS) {
      expect(['identity', 'app']).toContain(auditOwnerOf(kind));
      if (kind.startsWith('auth.') && !kind.startsWith('auth.github_')) {
        expect(auditOwnerOf(kind)).toBe('identity');
      }
      if (/^(workspace|project|task|document|agent|token)\./.test(kind)) {
        expect(auditOwnerOf(kind)).toBe('app');
      }
    }
    expect(auditOwnerOf('admin.user_banned')).toBe('identity');
    expect(auditOwnerOf('admin.impersonation_started')).toBe('app');
  });

  it('truncates long snapshot strings instead of rejecting', () => {
    const parsed = AUDIT_EVENTS['task.created'].data.parse({
      taskKey: 'TSK-1',
      taskNumber: 1,
      title: 'x'.repeat(500),
    });
    expect(parsed.title).toHaveLength(200);
  });

  it('rejects data of a wrong shape', () => {
    expect(AUDIT_EVENTS['auth.sign_in'].data.safeParse({ method: 'magic' }).success).toBe(false);
  });

  it('recognizes kinds and lists them by category', () => {
    expect(isAuditEventKind('auth.sign_in')).toBe(true);
    expect(isAuditEventKind('toString')).toBe(false);
    expect(auditKindsOfCategory('content')).toContain('document.deleted');
    expect(auditKindsOfCategory('content')).not.toContain('auth.sign_in');
  });
});
