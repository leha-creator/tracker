import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/shared/auth';
import { ForbiddenError, NotFoundError } from '@/shared/errors';

const list = vi.fn<(where: unknown, cursor: unknown, take: number) => Promise<unknown[]>>();
const purgeBatch = vi.fn<(before: Date) => Promise<number>>();
const requireAdmin = vi.fn<() => Promise<AuthSession>>();
const requireUser = vi.fn<() => Promise<AuthSession>>();
const requireWorkspaceAccess =
  vi.fn<(session: AuthSession, workspaceId: string) => Promise<unknown>>();

vi.mock('@/shared/access', () => ({
  requireAdmin: () => requireAdmin(),
  requireUser: () => requireUser(),
  requireWorkspaceAccess: (session: AuthSession, workspaceId: string) =>
    requireWorkspaceAccess(session, workspaceId),
}));
vi.mock('./event.repository', () => ({
  AUDIT_PURGE_BATCH_SIZE: 2,
  auditEventRepository: {
    list: (where: unknown, cursor: unknown, take: number) => list(where, cursor, take),
    count: () => Promise.resolve(0),
    purgeBatch: (before: Date) => purgeBatch(before),
  },
}));

const {
  listAdminAuditEvents,
  listMemberWorkspaceActivity,
  listMySecurityEvents,
  purgeExpiredAuditEvents,
} = await import('./event.service');
const { EMPTY_ADMIN_AUDIT_QUERY } = await import('../../models');

const session = { user: { id: 'u1', name: 'Анна' }, session: { id: 's1' } } as AuthSession;

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: '0199f0d2-7c3a-7b1e-9a4f-1c2d3e4f5a6b',
    kind: 'auth.sign_in',
    category: 'security',
    data: { method: 'password' },
    ip: '203.0.113.5',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/141.0 Safari/537.36',
    createdAt: new Date('2026-10-19T10:00:00.000Z'),
    actorId: 'u1',
    actorName: null,
    targetUserId: null,
    actor: { id: 'u1', name: 'Анна', image: null, isAgent: false },
    impersonator: null,
    targetUser: null,
    viaToken: null,
    workspace: null,
    ...overrides,
  };
}

beforeEach(() => {
  list.mockReset().mockResolvedValue([]);
  purgeBatch.mockReset();
  requireAdmin.mockReset().mockResolvedValue(session);
  requireUser.mockReset().mockResolvedValue(session);
  requireWorkspaceAccess.mockReset().mockResolvedValue({});
});

describe('listMemberWorkspaceActivity', () => {
  it('requires membership of the viewer', async () => {
    requireWorkspaceAccess.mockRejectedValueOnce(new NotFoundError('Пространство не найдено'));
    await expect(listMemberWorkspaceActivity(session, 'w1', 'u2')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(list).not.toHaveBeenCalled();
  });

  it('shows only workspace events of this member without IP', async () => {
    list.mockResolvedValueOnce([
      row({
        kind: 'task.created',
        category: 'content',
        data: { taskKey: 'TSK-1', taskNumber: 1, title: 'A' },
        workspace: { id: 'w1', slug: 'team', name: 'Команда' },
      }),
    ]);
    const page = await listMemberWorkspaceActivity(session, 'w1', 'u2');
    expect(list).toHaveBeenCalledWith(
      { workspaceId: 'w1', actorId: 'u2', category: { in: ['workspace', 'content'] } },
      null,
      21,
    );
    expect(page.items[0]).toMatchObject({ href: '/w/team/tasks/1', ip: null, device: null });
  });
});

describe('listMySecurityEvents', () => {
  it('includes events where the user is the subject and shows the device', async () => {
    list.mockResolvedValueOnce([row()]);
    const page = await listMySecurityEvents();
    expect(list.mock.calls[0]?.[0]).toEqual({
      category: 'security',
      OR: [{ actorId: 'u1' }, { targetUserId: 'u1' }],
    });
    expect(page.items[0]).toMatchObject({
      text: 'Вход по паролю',
      ip: '203.0.113.5',
      device: 'Chrome · Windows',
    });
  });

  it('returns a cursor when there are more events', async () => {
    list.mockResolvedValueOnce(Array.from({ length: 31 }, () => row()));
    const page = await listMySecurityEvents();
    expect(page.items).toHaveLength(30);
    expect(page.nextCursor).toMatch(/^2026-10-19T10:00:00.000Z_/);
  });
});

describe('listAdminAuditEvents', () => {
  it('rejects non-admins', async () => {
    requireAdmin.mockRejectedValueOnce(new ForbiddenError());
    await expect(listAdminAuditEvents(EMPTY_ADMIN_AUDIT_QUERY)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('filters by user as actor, subject or impersonator', async () => {
    await listAdminAuditEvents({ ...EMPTY_ADMIN_AUDIT_QUERY, userId: 'u2', category: 'admin' });
    expect(list.mock.calls[0]?.[0]).toEqual({
      AND: [
        { OR: [{ actorId: 'u2' }, { targetUserId: 'u2' }, { impersonatorId: 'u2' }] },
        { category: 'admin' },
      ],
    });
  });

  it('names a deleted author by the snapshot and an unknown one as system', async () => {
    list.mockResolvedValueOnce([
      row({ actor: null, actorId: null, actorName: 'Удалённый' }),
      row({ actor: null, actorId: null, actorName: null }),
    ]);
    const page = await listAdminAuditEvents(EMPTY_ADMIN_AUDIT_QUERY);
    expect(page.items[0]?.actor).toMatchObject({ id: null, name: 'Удалённый' });
    expect(page.items[1]?.actor).toBeNull();
  });
});

describe('purgeExpiredAuditEvents', () => {
  it('deletes in batches until a short batch', async () => {
    purgeBatch.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    const result = await purgeExpiredAuditEvents({
      now: new Date('2026-10-19T00:00:00.000Z'),
      retentionDays: 180,
    });
    expect(result).toEqual({ deleted: 3, cutoff: new Date('2026-04-22T00:00:00.000Z') });
    expect(purgeBatch).toHaveBeenCalledTimes(2);
  });
});
