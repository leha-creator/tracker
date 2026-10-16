import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/shared/auth';
import type * as GithubApiModule from '../../github-api';
import { ForbiddenError, NotFoundError } from '@/shared/errors';

const findByUser = vi.fn<(userId: string) => Promise<{ id: string; accountId: string } | null>>();
const findByGithubIds =
  vi.fn<(ids: string[]) => Promise<{ userId: string; accountId: string }[]>>();
const getAccessToken = vi.fn();
const unlinkAccount = vi.fn();
const userRequest = vi.fn();
let enabled = true;

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/shared/auth', () => ({
  getAuth: () => ({ api: { getAccessToken, unlinkAccount } }),
}));
vi.mock('../../github-api', async (importOriginal) => ({
  ...(await importOriginal<typeof GithubApiModule>()),
  isGithubEnabled: () => enabled,
  getUserClient: () => ({ request: userRequest }),
}));
vi.mock('./identity.repository', () => ({
  identityRepository: {
    findByUser: (...args: Parameters<typeof findByUser>) => findByUser(...args),
    findByGithubIds: (...args: Parameters<typeof findByGithubIds>) => findByGithubIds(...args),
  },
}));

const { findUsersByGithubIds, getGithubUserToken, getMyGithubAccount, unlinkGithub } =
  await import('./identity.service');

const session = { user: { id: 'u1' } } as AuthSession;

beforeEach(() => {
  vi.resetAllMocks();
  enabled = true;
});

describe('findUsersByGithubIds', () => {
  it('maps github ids (any numeric form) to user ids', async () => {
    findByGithubIds.mockResolvedValue([{ userId: 'u1', accountId: '42' }]);
    const users = await findUsersByGithubIds([42n, 42, '7']);
    expect(findByGithubIds).toHaveBeenCalledWith(['42', '7']);
    expect(users.get('42')).toBe('u1');
    expect(users.has('7')).toBe(false);
  });

  it('skips the query for an empty list', async () => {
    await expect(findUsersByGithubIds([])).resolves.toEqual(new Map());
    expect(findByGithubIds).not.toHaveBeenCalled();
  });
});

describe('getGithubUserToken', () => {
  it('returns a valid token through Better Auth (refreshing if needed)', async () => {
    findByUser.mockResolvedValue({ id: 'acc-1', accountId: '42' });
    getAccessToken.mockResolvedValue({ accessToken: 'ghu_token' });
    await expect(getGithubUserToken('u1')).resolves.toBe('ghu_token');
    expect(getAccessToken).toHaveBeenCalledWith({ body: { accountId: 'acc-1', userId: 'u1' } });
  });

  it('requires a linked account', async () => {
    findByUser.mockResolvedValue(null);
    await expect(getGithubUserToken('u1')).rejects.toThrow(ForbiddenError);
  });

  it('maps token errors to ForbiddenError', async () => {
    findByUser.mockResolvedValue({ id: 'acc-1', accountId: '42' });
    getAccessToken.mockRejectedValue(new Error('refresh failed'));
    await expect(getGithubUserToken('u1')).rejects.toThrow(ForbiddenError);
  });

  it('is unavailable when GitHub is not configured', async () => {
    enabled = false;
    await expect(getGithubUserToken('u1')).rejects.toThrow(NotFoundError);
  });
});

describe('getMyGithubAccount', () => {
  it('reports unlinked account', async () => {
    findByUser.mockResolvedValue(null);
    await expect(getMyGithubAccount(session)).resolves.toEqual({ linked: false });
  });

  it('returns login from GitHub', async () => {
    findByUser.mockResolvedValue({ id: 'acc-1', accountId: '42' });
    getAccessToken.mockResolvedValue({ accessToken: 'ghu_token' });
    userRequest.mockResolvedValue({ data: { login: 'octocat' } });
    await expect(getMyGithubAccount(session)).resolves.toEqual({
      linked: true,
      githubId: '42',
      login: 'octocat',
    });
  });

  it('keeps linked state with unknown login when the token is unavailable', async () => {
    findByUser.mockResolvedValue({ id: 'acc-1', accountId: '42' });
    getAccessToken.mockRejectedValue(new Error('expired'));
    await expect(getMyGithubAccount(session)).resolves.toEqual({
      linked: true,
      githubId: '42',
      login: null,
    });
  });
});

describe('unlinkGithub', () => {
  it('unlinks by Better Auth account id', async () => {
    findByUser.mockResolvedValue({ id: 'acc-1', accountId: '42' });
    unlinkAccount.mockResolvedValue({ status: true });
    await unlinkGithub(session);
    expect(unlinkAccount).toHaveBeenCalledWith(
      expect.objectContaining({ body: { accountId: 'acc-1' } }),
    );
  });

  it('maps refusal (last sign-in method) to ForbiddenError', async () => {
    findByUser.mockResolvedValue({ id: 'acc-1', accountId: '42' });
    unlinkAccount.mockRejectedValue(new Error('FAILED_TO_UNLINK_LAST_ACCOUNT'));
    await expect(unlinkGithub(session)).rejects.toThrow(ForbiddenError);
  });

  it('fails when nothing is linked', async () => {
    findByUser.mockResolvedValue(null);
    await expect(unlinkGithub(session)).rejects.toThrow(NotFoundError);
  });
});
