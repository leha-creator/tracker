import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AccessModule from '@/shared/access';
import { recordAuditEvent } from '@/shared/audit';
import type { AuthSession } from '@/shared/auth';
import { ForbiddenError, InternalError, ValidationError } from '@/shared/errors';

const requireAdmin = vi.fn<() => Promise<AuthSession>>();
const getAccountMetrics = vi.fn();
const sendMail = vi.fn();
const enforceRateLimit = vi.fn();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireAdmin: () => requireAdmin(),
}));
vi.mock('@/modules/auth', () => ({
  getAccountMetrics: (...args: unknown[]) => getAccountMetrics(...args) as unknown,
}));
vi.mock('@/modules/documents', () => ({
  getTotalDocumentStorageUsage: () => Promise.resolve({ usedBytes: 100, filesCount: 2 }),
}));
vi.mock('@/modules/tasks', () => ({
  getTotalAttachmentStorageUsage: () => Promise.resolve({ usedBytes: 50, filesCount: 1 }),
}));
vi.mock('@/modules/workspaces', () => ({
  countAllWorkspaces: () => Promise.resolve({ total: 3, archived: 1 }),
}));
vi.mock('@/shared/health', () => ({
  checkHealth: () =>
    Promise.resolve({ status: 'ok', checks: { db: { ok: true }, storage: { ok: false } } }),
}));
vi.mock('@/shared/mail', () => ({
  sendMail: (...args: unknown[]) => sendMail(...args) as unknown,
  escapeHtml: (value: string) => value,
}));
vi.mock('@/shared/rate-limit', () => ({
  enforceRateLimit: (...args: unknown[]) => enforceRateLimit(...args) as unknown,
  getClientIp: () => '203.0.113.5',
}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));

const { getResourceOverview, sendTestMail } = await import('./overview.service');

const adminSession: AuthSession = {
  user: {
    id: 'admin-1',
    email: 'admin@example.com',
    name: 'Admin',
    image: null,
    role: 'admin',
    banned: false,
    isAgent: false,
  },
  session: { id: 's-1', expiresAt: new Date('2030-01-01') },
};

function metrics(signupsByDay: { day: string; count: number }[]) {
  return {
    users: { total: 10, admins: 1, banned: 2, unverified: 3, twoFactor: 4 },
    sessions: { active: 4, impersonated: 0 },
    signupsByDay,
    failedSignIns: 7,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(adminSession);
  getAccountMetrics.mockResolvedValue(metrics([]));
  sendMail.mockResolvedValue({ messageId: 'm-1' });
  enforceRateLimit.mockResolvedValue(undefined);
});

describe('getResourceOverview', () => {
  it('rejects non-admins before reading data', async () => {
    requireAdmin.mockRejectedValue(new ForbiddenError());
    await expect(getResourceOverview()).rejects.toBeInstanceOf(ForbiddenError);
    expect(getAccountMetrics).not.toHaveBeenCalled();
  });

  it('aggregates counters and fills the signup series', async () => {
    const today = new Date().toISOString().slice(0, 10);
    getAccountMetrics.mockResolvedValue(metrics([{ day: today, count: 2 }]));
    const overview = await getResourceOverview();
    expect(overview.signups).toHaveLength(30);
    expect(overview.signups.at(-1)).toEqual({ day: today, count: 2 });
    expect(overview.signupsTotal).toBe(2);
    expect(overview.failedSignIns24h).toBe(7);
    const { now, failedSignInsSince } = getAccountMetrics.mock.calls[0]![0] as {
      now: Date;
      failedSignInsSince: Date;
    };
    expect(now.getTime() - failedSignInsSince.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(overview.users.twoFactor).toBe(4);
    expect(overview.health).toEqual({ db: true, storage: false });
    expect(overview.storage.attachments.usedBytes).toBe(50);
  });
});

describe('sendTestMail', () => {
  it('sends to the admin email under the admin-mail limit and records the event', async () => {
    await expect(sendTestMail()).resolves.toEqual({ to: 'admin@example.com' });
    expect(enforceRateLimit).toHaveBeenCalledWith('admin-mail', {
      ip: '203.0.113.5',
      userId: 'admin-1',
    });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@example.com' }));
    expect(vi.mocked(recordAuditEvent)).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'admin.test_mail_sent' }),
    );
  });

  it('explains SMTP failures and records nothing', async () => {
    sendMail.mockRejectedValue(new InternalError('smtp down'));
    await expect(sendTestMail()).rejects.toBeInstanceOf(ValidationError);
    expect(vi.mocked(recordAuditEvent)).not.toHaveBeenCalled();
  });
});
