import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/shared/auth';

const create = vi.fn<(args: { data: Record<string, unknown> }) => Promise<unknown>>();

vi.mock('@/shared/db', () => ({
  prisma: { auditEvent: { create: (args: { data: Record<string, unknown> }) => create(args) } },
}));

const { auditActorFromSession, auditRequestContext, recordAuditEvent } =
  await import('./record-audit-event');

const REQUEST = { ip: '203.0.113.7', userAgent: 'Firefox' };

function session(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    user: {
      id: 'u1',
      email: 'a@example.com',
      name: 'Анна',
      image: null,
      role: 'user',
      banned: false,
      isAgent: false,
    },
    session: { id: 's1', expiresAt: new Date(), impersonatedBy: null },
    ...overrides,
  };
}

beforeEach(() => {
  create.mockReset().mockResolvedValue({});
});

describe('recordAuditEvent', () => {
  it('stores category and request context for security events', async () => {
    await recordAuditEvent({
      kind: 'auth.sign_in',
      actor: { actorId: 'u1', actorName: 'Анна' },
      data: { method: 'password' },
      request: REQUEST,
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'auth.sign_in',
        category: 'security',
        actorId: 'u1',
        ip: REQUEST.ip,
        userAgent: REQUEST.userAgent,
      }),
    });
  });

  it('drops request context for non-security events', async () => {
    await recordAuditEvent({
      kind: 'task.created',
      actor: { actorId: 'u1' },
      workspaceId: 'w1',
      data: { taskKey: 'TSK-1', taskNumber: 1, title: 'Задача' },
      request: REQUEST,
    });
    expect(create.mock.calls[0]![0].data).toMatchObject({ ip: null, userAgent: null });
  });

  it('skips invalid data without throwing', async () => {
    await expect(
      recordAuditEvent({
        kind: 'auth.sign_in',
        actor: null,
        data: { method: 'magic' } as never,
      }),
    ).resolves.toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });

  it('never throws when the insert fails', async () => {
    create.mockRejectedValueOnce(new Error('db down'));
    await expect(
      recordAuditEvent({ kind: 'auth.sign_out', actor: { actorId: 'u1' }, data: {} }),
    ).resolves.toBeUndefined();
  });
});

describe('auditActorFromSession', () => {
  it('takes the impersonating admin and the MCP token', () => {
    const actor = auditActorFromSession(
      session({
        session: { id: 's1', expiresAt: new Date(), impersonatedBy: 'admin1' },
        via: { tokenId: 't1', tokenName: 'CI', scopes: ['read'], agent: null },
      }),
    );
    expect(actor).toEqual({
      actorId: 'u1',
      actorName: 'Анна',
      impersonatorId: 'admin1',
      viaTokenId: 't1',
    });
  });
});

describe('auditRequestContext', () => {
  it('reads the client IP and truncates the user agent', () => {
    const headers = new Headers({
      'x-forwarded-for': '198.51.100.1, 10.0.0.1',
      'user-agent': 'a'.repeat(400),
    });
    const context = auditRequestContext(headers);
    expect(context.ip).toBe('198.51.100.1');
    expect(context.userAgent).toHaveLength(300);
  });
});
