import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceAccess, WorkspaceRole } from '@/shared/access';
import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { ForbiddenError, NotFoundError } from '@/shared/errors';

import type * as GithubApiModule from '../../github-api';
import { signInstallState } from './install-state';

const SECRET = 'a-very-long-local-development-secret-value';

const requireWorkspaceAccess =
  vi.fn<
    (session: AuthSession, workspaceId: string, minRole?: WorkspaceRole) => Promise<WorkspaceAccess>
  >();
const getGithubIdentity = vi.fn<(userId: string) => Promise<{ githubId: string } | null>>();
const getGithubUserToken = vi.fn<(userId: string) => Promise<string>>();
const userPaginate = vi.fn();
const installationPaginate = vi.fn();
const repo = {
  upsertInstallation: vi.fn(),
  syncRepositories: vi.fn(),
  linkWorkspace: vi.fn(),
  unlinkWorkspace: vi.fn(),
  listForWorkspace: vi.fn(),
  findWorkspaceRepository: vi.fn(),
  setRepositoryEnabled: vi.fn(),
};

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: (...args: Parameters<typeof requireWorkspaceAccess>) =>
    requireWorkspaceAccess(...args),
}));
vi.mock('@/shared/db', () => ({
  prisma: { $transaction: (run: (tx: unknown) => Promise<unknown>) => run({}) },
}));
vi.mock('@/shared/env', () => ({
  getEnv: () => ({ BETTER_AUTH_SECRET: SECRET, LOG_LEVEL: 'silent' }),
}));
vi.mock('../../github-api', async (importOriginal) => ({
  ...(await importOriginal<typeof GithubApiModule>()),
  isGithubEnabled: () => true,
  getUserClient: () => ({ paginate: userPaginate }),
  getInstallationClient: () => Promise.resolve({ paginate: installationPaginate }),
  githubInstallUrl: (state: string) =>
    `https://github.com/apps/tasker/installations/new?state=${state}`,
}));
vi.mock('../identity/identity.service', () => ({
  getGithubIdentity: (...args: Parameters<typeof getGithubIdentity>) => getGithubIdentity(...args),
  getGithubUserToken: (...args: Parameters<typeof getGithubUserToken>) =>
    getGithubUserToken(...args),
}));
vi.mock('./installation.repository', () => ({ installationRepository: repo }));

const {
  completeInstallation,
  connectInstallation,
  installationConfigureUrl,
  setRepositoryEnabled,
  startInstallation,
  INVALID_INSTALL_STATE,
} = await import('./installation.service');

const session = { user: { id: 'u1' } } as AuthSession;
const userInstallation = {
  id: 77,
  suspended_at: null,
  account: { id: 9, login: 'acme', type: 'Organization' },
};

beforeEach(() => {
  vi.resetAllMocks();
  requireWorkspaceAccess.mockResolvedValue({} as WorkspaceAccess);
  getGithubUserToken.mockResolvedValue('ghu_token');
  getGithubIdentity.mockResolvedValue({ githubId: '1' });
  repo.syncRepositories.mockResolvedValue({ removed: 0 });
});

describe('connectInstallation', () => {
  it('rejects installations not accessible to the user (forged installation_id)', async () => {
    userPaginate.mockResolvedValue([{ ...userInstallation, id: 1 }]);
    await expect(
      connectInstallation(session, { workspaceId: 'w1', installationId: '77' }),
    ).rejects.toThrow(ForbiddenError);
    expect(repo.linkWorkspace).not.toHaveBeenCalled();
  });

  it('requires owner role', async () => {
    requireWorkspaceAccess.mockRejectedValue(new ForbiddenError());
    await expect(
      connectInstallation(session, { workspaceId: 'w1', installationId: '77' }),
    ).rejects.toThrow(ForbiddenError);
    expect(requireWorkspaceAccess).toHaveBeenCalledWith(session, 'w1', 'owner');
    expect(userPaginate).not.toHaveBeenCalled();
  });

  it('stores installation, syncs repositories and links workspace', async () => {
    userPaginate.mockResolvedValue([userInstallation]);
    installationPaginate.mockResolvedValue([
      { id: 5, full_name: 'acme/web', private: true, default_branch: 'main' },
    ]);
    await connectInstallation(session, { workspaceId: 'w1', installationId: '77' });

    expect(repo.upsertInstallation).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ id: 77n, accountLogin: 'acme', accountType: 'Organization' }),
    );
    expect(repo.syncRepositories).toHaveBeenCalledWith({}, 77n, [
      { id: 5n, fullName: 'acme/web', private: true, defaultBranch: 'main' },
    ]);
    expect(repo.linkWorkspace).toHaveBeenCalledWith({}, 'w1', 77n, 'u1');
  });
});

describe('startInstallation / completeInstallation', () => {
  it('requires linked GitHub to start', async () => {
    getGithubIdentity.mockResolvedValue(null);
    await expect(
      startInstallation(session, { workspaceId: 'w1', workspaceSlug: 'team' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('returns install URL with a state that completes for the same user', async () => {
    const url = await startInstallation(session, { workspaceId: 'w1', workspaceSlug: 'team' });
    const state = new URL(url).searchParams.get('state')!;
    userPaginate.mockResolvedValue([userInstallation]);
    installationPaginate.mockResolvedValue([]);

    await expect(
      completeInstallation(session, { installationId: '77', setupAction: 'install', state }),
    ).resolves.toEqual({ workspaceSlug: 'team' });
    expect(repo.linkWorkspace).toHaveBeenCalledWith({}, 'w1', 77n, 'u1');
  });

  it('rejects state of another user with invalid-state reason', async () => {
    const state = signInstallState(
      { workspaceId: 'w1', workspaceSlug: 'team', userId: 'u2' },
      SECRET,
    );
    const error = await completeInstallation(session, { installationId: '77', state }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).details?.reason).toBe(INVALID_INSTALL_STATE);
    expect(repo.linkWorkspace).not.toHaveBeenCalled();
  });
});

describe('setRepositoryEnabled', () => {
  it('rejects repositories of installations not connected to the workspace', async () => {
    repo.findWorkspaceRepository.mockResolvedValue(null);
    await expect(
      setRepositoryEnabled(session, { workspaceId: 'w1', repositoryId: '5', enabled: true }),
    ).rejects.toThrow(NotFoundError);
    expect(repo.setRepositoryEnabled).not.toHaveBeenCalled();
  });

  it('toggles repository of a connected installation', async () => {
    repo.findWorkspaceRepository.mockResolvedValue({ id: 5n, fullName: 'acme/web' });
    await setRepositoryEnabled(session, { workspaceId: 'w1', repositoryId: '5', enabled: false });
    expect(repo.setRepositoryEnabled).toHaveBeenCalledWith('w1', 5n, false);
  });
});

describe('installationConfigureUrl', () => {
  it('points to organization or user settings', () => {
    expect(
      installationConfigureUrl({ id: '7', accountLogin: 'acme', accountType: 'Organization' }),
    ).toBe('https://github.com/organizations/acme/settings/installations/7');
    expect(installationConfigureUrl({ id: '7', accountLogin: 'me', accountType: 'User' })).toBe(
      'https://github.com/settings/installations/7',
    );
  });
});
