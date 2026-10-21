import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/shared/auth';

import { verifyTaskContext } from '../../models';

const SECRET = 'c'.repeat(32);
const requireWorkspaceAccess = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const findIdpSubject = vi.fn<(userId: string) => Promise<string | null>>();
const enforceRateLimit = vi.fn<(...args: unknown[]) => Promise<void>>();
const findTask = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@/shared/env', () => ({
  getEnv: () => ({ LOG_LEVEL: 'silent' }),
  env: {
    MEET_ENABLED: true,
    MEET_URL: 'https://meet.plwedding.ru',
    MEET_CONTEXT_SECRET: 'c'.repeat(32),
    MEET_WEBHOOK_SECRET: 'w'.repeat(32),
    BETTER_AUTH_URL: 'https://tracker.plwedding.ru',
  },
}));
vi.mock('@/shared/access', () => ({
  requireWorkspaceAccess: (...args: unknown[]) => requireWorkspaceAccess(...args),
}));
vi.mock('@/shared/idp', () => ({ findIdpSubject: (id: string) => findIdpSubject(id) }));
vi.mock('@/shared/rate-limit', () => ({
  enforceRateLimit: (...args: unknown[]) => enforceRateLimit(...args),
}));
vi.mock('@/modules/tasks', () => ({
  formatTaskKey: (number: number, key: string | null) => (key ? `${key}-${number}` : `#${number}`),
}));
vi.mock('../meeting/meeting.repository', () => ({
  meetingRepository: { findTask: (...args: unknown[]) => findTask(...args) },
}));

const { startTaskMeeting } = await import('./start.service');

const TASK_ID = '0193a000-0000-7000-8000-000000000042';
const session = { user: { id: 'u1', isAgent: false } } as AuthSession;
const input = { workspaceId: 'ws-1', taskId: TASK_ID, ip: '10.0.0.1' };
const task = {
  id: TASK_ID,
  number: 42,
  title: 'Макет',
  archivedAt: null,
  assigneeId: null,
  workspace: { id: 'ws-1', slug: 'team', name: 'Команда', taskKey: 'TSK', archivedAt: null },
};

beforeEach(() => {
  vi.resetAllMocks();
  requireWorkspaceAccess.mockResolvedValue({});
  findTask.mockResolvedValue(task);
  findIdpSubject.mockResolvedValue('sub-1');
  enforceRateLimit.mockResolvedValue();
});

describe('startTaskMeeting', () => {
  it('returns a meet link with a signed task context', async () => {
    const { url } = await startTaskMeeting(session, input);
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://meet.plwedding.ru/new');
    const result = verifyTaskContext(parsed.searchParams.get('ctx') ?? '', SECRET, {
      now: Math.floor(Date.now() / 1000),
      mode: 'link',
    });
    expect(result.ok && result.context).toMatchObject({
      sub: 'sub-1',
      workspaceId: 'ws-1',
      taskId: TASK_ID,
      taskKey: 'TSK-42',
      taskTitle: 'Макет',
      taskUrl: 'https://tracker.plwedding.ru/w/team/tasks/42',
    });
    expect(enforceRateLimit).toHaveBeenCalledWith('meet.start', { ip: '10.0.0.1', userId: 'u1' });
  });

  it('rejects token and agent sessions', async () => {
    const viaToken = { ...session, via: { tokenId: 't' } } as AuthSession;
    await expect(startTaskMeeting(viaToken, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const agent = { user: { id: 'a1', isAgent: true } } as AuthSession;
    await expect(startTaskMeeting(agent, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(requireWorkspaceAccess).not.toHaveBeenCalled();
  });

  it('rejects archived and missing tasks', async () => {
    findTask.mockResolvedValueOnce({ ...task, archivedAt: new Date() });
    await expect(startTaskMeeting(session, input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    findTask.mockResolvedValueOnce(null);
    await expect(startTaskMeeting(session, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('requires a link with plwedding ID before the rate limit', async () => {
    findIdpSubject.mockResolvedValue(null);
    await expect(startTaskMeeting(session, input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });
});
