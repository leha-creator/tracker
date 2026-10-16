import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/shared/auth';
import { NotFoundError, ValidationError } from '@/shared/errors';

const listActive = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const deleteOwned = vi.fn<(...args: unknown[]) => Promise<number>>();
const deleteOthers = vi.fn<(...args: unknown[]) => Promise<number>>();

vi.mock('@/shared/access', () => ({
  requireUser: () =>
    Promise.resolve({ user: { id: 'u1' }, session: { id: 'current' } } as AuthSession),
}));
vi.mock('./session.repository', () => ({
  sessionRepository: {
    listActive: (...args: unknown[]) => listActive(...args),
    deleteOwned: (...args: unknown[]) => deleteOwned(...args),
    deleteOthers: (...args: unknown[]) => deleteOthers(...args),
  },
}));

const { listMySessions, revokeMyOtherSessions, revokeMySession } =
  await import('./session.service');

const ROW = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/141.0 Safari/537.36',
  ipAddress: '203.0.113.5',
  impersonatedBy: null,
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-10'),
};

beforeEach(() => {
  listActive.mockReset();
  deleteOwned.mockReset();
  deleteOthers.mockReset();
});

describe('listMySessions', () => {
  it('puts the current session first and hides tokens', async () => {
    listActive.mockResolvedValueOnce([
      { ...ROW, id: 'other', token: 'secret-token' },
      { ...ROW, id: 'current', impersonatedBy: 'admin-1' },
    ]);

    const items = await listMySessions();

    expect(items.map((item) => [item.id, item.current])).toEqual([
      ['current', true],
      ['other', false],
    ]);
    expect(items[0]).toMatchObject({ deviceLabel: 'Chrome · Windows', impersonated: true });
    expect(JSON.stringify(items)).not.toContain('secret-token');
    expect(listActive).toHaveBeenCalledWith('u1', expect.any(Date));
  });
});

describe('revokeMySession', () => {
  it('refuses the current session', async () => {
    await expect(revokeMySession('current')).rejects.toBeInstanceOf(ValidationError);
    expect(deleteOwned).not.toHaveBeenCalled();
  });

  it('reports a foreign or unknown session as not found', async () => {
    deleteOwned.mockResolvedValueOnce(0);
    await expect(revokeMySession('foreign')).rejects.toBeInstanceOf(NotFoundError);
    expect(deleteOwned).toHaveBeenCalledWith('u1', 'foreign');
  });

  it('deletes an owned session', async () => {
    deleteOwned.mockResolvedValueOnce(1);
    await expect(revokeMySession('other')).resolves.toBeUndefined();
  });
});

describe('revokeMyOtherSessions', () => {
  it('keeps the current session', async () => {
    deleteOthers.mockResolvedValueOnce(3);
    await expect(revokeMyOtherSessions()).resolves.toBe(3);
    expect(deleteOthers).toHaveBeenCalledWith('u1', 'current');
  });
});
