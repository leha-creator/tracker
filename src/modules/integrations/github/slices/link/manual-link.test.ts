import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/shared/auth';
import { NotFoundError, ValidationError } from '@/shared/errors';

import type * as GithubApiModule from '../../github-api';
import { linkPullRequestSchema } from './link.schema';

const requireWorkspaceAccess = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const resolveTaskRefsByIds = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const storePullRequest = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const request = vi.fn<(...args: unknown[]) => Promise<{ data: unknown }>>();
const linkRepo = {
  findWorkspaceRepositoryByName: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  upsertManualLink: vi.fn<(...args: unknown[]) => Promise<void>>(),
  dismissLink: vi.fn<(...args: unknown[]) => Promise<number>>(),
};

vi.mock('@/shared/env', () => ({ getEnv: () => ({ LOG_LEVEL: 'silent' }) }));
vi.mock('@/shared/access', () => ({
  requireWorkspaceAccess: (...args: unknown[]) => requireWorkspaceAccess(...args),
}));
vi.mock('@/shared/db', () => ({
  prisma: { $transaction: (run: (tx: unknown) => Promise<unknown>) => run({}) },
}));
vi.mock('@/modules/tasks', () => ({
  resolveTaskRefsByIds: (...args: unknown[]) => resolveTaskRefsByIds(...args),
}));
vi.mock('../../github-api', async (importOriginal) => ({
  ...(await importOriginal<typeof GithubApiModule>()),
  isGithubEnabled: () => true,
  getInstallationClient: () => Promise.resolve({ request }),
}));
vi.mock('../pull-request/pull-request.service', () => ({
  storePullRequest: (...args: unknown[]) => storePullRequest(...args),
}));
vi.mock('./link.repository', () => ({ linkRepository: linkRepo }));

const { dismissPullRequest, linkPullRequestByUrl } = await import('./manual-link.service');

const session = { user: { id: 'u1' } } as AuthSession;
const TASK = '0192f3a0-0000-7000-8000-000000000042';
const url = { owner: 'acme', repo: 'web', number: 12 };
const prData = {
  id: 1001,
  number: 12,
  title: 'Fix',
  body: null,
  html_url: 'https://github.com/acme/web/pull/12',
  state: 'open',
  draft: false,
  merged: false,
  merged_at: null,
  closed_at: null,
  updated_at: '2026-10-16T10:00:00Z',
  head: { ref: 'fix', sha: 'abc' },
  user: { id: 1, login: 'dev' },
};

beforeEach(() => {
  vi.resetAllMocks();
  requireWorkspaceAccess.mockResolvedValue({});
  resolveTaskRefsByIds.mockResolvedValue([{ taskId: TASK }]);
  linkRepo.findWorkspaceRepositoryByName.mockResolvedValue({
    id: 5n,
    fullName: 'acme/web',
    installationId: 77n,
  });
  request.mockResolvedValue({ data: prData });
});

describe('linkPullRequestSchema', () => {
  const parse = (value: string) =>
    linkPullRequestSchema.safeParse({ workspaceId: 'w1', taskId: TASK, url: value });

  it.each([
    'https://github.com/acme/web/pull/12',
    'https://github.com/acme/web.js/pull/12/files',
    ' https://github.com/acme/web/pull/12#discussion ',
  ])('accepts %s', (value) => {
    const result = parse(value);
    expect(result.success).toBe(true);
    expect(result.data?.url.number).toBe(12);
  });

  it.each([
    'https://gitlab.com/acme/web/pull/12',
    'http://github.com/acme/web/pull/12',
    'https://github.com.evil.com/acme/web/pull/12',
    'https://github.com/acme/web/issues/12',
    'https://github.com/acme/web/pull/0',
    'javascript:alert(1)',
    'not a url',
    '',
  ])('rejects %s', (value) => {
    const result = parse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['url']);
  });
});

describe('linkPullRequestByUrl', () => {
  it('fetches PR with installation token and links it manually', async () => {
    await linkPullRequestByUrl(session, { workspaceId: 'w1', taskId: TASK, url });
    expect(request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
      owner: 'acme',
      repo: 'web',
      pull_number: 12,
    });
    expect(storePullRequest).toHaveBeenCalledWith({}, 5n, expect.objectContaining({ id: 1001 }));
    expect(linkRepo.upsertManualLink).toHaveBeenCalledWith(
      {},
      { taskId: TASK, workspaceId: 'w1', pullRequestId: 1001n },
    );
  });

  it('rejects repositories not enabled in the workspace', async () => {
    linkRepo.findWorkspaceRepositoryByName.mockResolvedValue(null);
    await expect(
      linkPullRequestByUrl(session, { workspaceId: 'w1', taskId: TASK, url }),
    ).rejects.toThrow(ValidationError);
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects tasks of another workspace', async () => {
    resolveTaskRefsByIds.mockResolvedValue([]);
    await expect(
      linkPullRequestByUrl(session, { workspaceId: 'w1', taskId: TASK, url }),
    ).rejects.toThrow(NotFoundError);
  });

  it('checks workspace membership first', async () => {
    requireWorkspaceAccess.mockRejectedValue(new NotFoundError());
    await expect(
      linkPullRequestByUrl(session, { workspaceId: 'w2', taskId: TASK, url }),
    ).rejects.toThrow(NotFoundError);
    expect(linkRepo.findWorkspaceRepositoryByName).not.toHaveBeenCalled();
  });
});

describe('dismissPullRequest', () => {
  it('dismisses a linked PR and fails for unknown links', async () => {
    linkRepo.dismissLink.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await dismissPullRequest(session, { workspaceId: 'w1', taskId: TASK, pullRequestId: '1001' });
    expect(linkRepo.dismissLink).toHaveBeenCalledWith('w1', TASK, 1001n);
    await expect(
      dismissPullRequest(session, { workspaceId: 'w1', taskId: TASK, pullRequestId: '1001' }),
    ).rejects.toThrow(NotFoundError);
  });
});
