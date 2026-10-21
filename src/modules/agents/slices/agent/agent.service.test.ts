import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceAccess, WorkspaceRole } from '@/shared/access';
import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { ForbiddenError } from '@/shared/errors';

import { AGENTS_PER_WORKSPACE_LIMIT } from '../../models';

const requireWorkspaceAccess =
  vi.fn<
    (session: AuthSession, workspaceId: string, minRole?: WorkspaceRole) => Promise<WorkspaceAccess>
  >();
const repo = {
  countActive: vi.fn<(ws: string) => Promise<number>>(),
  isHumanMember: vi.fn<(ws: string, userId: string) => Promise<boolean>>(),
  create: vi.fn<(data: Record<string, unknown>) => Promise<void>>(),
  listByWorkspace: vi.fn<(ws: string) => Promise<unknown[]>>(),
  findInWorkspace: vi.fn<(ws: string, agentId: string) => Promise<unknown>>(),
  update: vi.fn<(data: Record<string, unknown>) => Promise<void>>(),
  disable: vi.fn<(ws: string, agentId: string, now: Date) => Promise<void>>(),
  enable: vi.fn<(ws: string, agentId: string, memberId: string) => Promise<void>>(),
};
const revokeAllUserApiTokens = vi.fn<(userId: string) => Promise<number>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: (...args: Parameters<typeof requireWorkspaceAccess>) =>
    requireWorkspaceAccess(...args),
}));
vi.mock('./agent.repository', () => ({ agentRepository: repo }));
vi.mock('@/modules/api-tokens', () => ({
  revokeAllUserApiTokens: (userId: string) => revokeAllUserApiTokens(userId),
}));

const { createAgent, disableAgent, enableAgent, listAgents, updateAgent } =
  await import('./agent.service');

const session: AuthSession = {
  user: {
    id: 'owner-1',
    email: 'owner@example.com',
    name: 'Owner',
    image: null,
    role: 'user',
    banned: false,
    isAgent: false,
  },
  session: { id: 's-1', expiresAt: new Date('2030-01-01') },
};

function accessAs(role: WorkspaceRole) {
  requireWorkspaceAccess.mockImplementation((_session, workspaceId, minRole = 'member') => {
    if (minRole === 'owner' && role !== 'owner') return Promise.reject(new ForbiddenError());
    return Promise.resolve({
      userId: session.user.id,
      workspaceId,
      memberId: 'm-self',
      role,
      permissions: { manageProjects: role === 'owner', manageDocuments: role === 'owner' },
    });
  });
}

function agentRow(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'agent-1',
    workspaceId: 'ws-1',
    description: null,
    disabledAt: null,
    createdAt: new Date('2026-10-01'),
    user: {
      name: 'Claude — backend',
      image: '/agent-avatar.svg',
      workspaceMemberships: [
        { workspaceId: 'ws-1', canManageProjects: false, canManageDocuments: true },
      ],
    },
    responsible: { id: 'user-2', name: 'Анна' },
    ...overrides,
  };
}

const createInput = {
  workspaceId: 'ws-1',
  name: 'Claude — backend',
  description: null,
  responsibleUserId: 'user-2',
  canManageProjects: false,
  canManageDocuments: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.countActive.mockResolvedValue(0);
  repo.isHumanMember.mockResolvedValue(true);
  repo.findInWorkspace.mockResolvedValue(agentRow());
});

describe('createAgent', () => {
  it('forbids a non-owner', async () => {
    accessAs('member');
    await expect(createAgent(session, createInput)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects when the limit is reached', async () => {
    accessAs('owner');
    repo.countActive.mockResolvedValue(AGENTS_PER_WORKSPACE_LIMIT);
    await expect(createAgent(session, createInput)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects a responsible who is not a member', async () => {
    accessAs('owner');
    repo.isHumanMember.mockResolvedValue(false);
    await expect(createAgent(session, createInput)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('creates the service user, membership and agent row in one call', async () => {
    accessAs('owner');
    const agent = await createAgent(session, createInput);

    expect(repo.create).toHaveBeenCalledTimes(1);
    const data = repo.create.mock.calls[0]![0] as {
      agentId: string;
      email: string;
      image: string;
      createdById: string;
      flags: unknown;
    };
    expect(data.email).toBe(`agent-${data.agentId}@agents.tasker.invalid`);
    expect(data.image).toBe('/agent-avatar.svg');
    expect(data.createdById).toBe('owner-1');
    expect(data.flags).toEqual({ canManageProjects: false, canManageDocuments: true });
    expect(agent).toMatchObject({
      name: 'Claude — backend',
      responsible: { userId: 'user-2', name: 'Анна' },
      canManageDocuments: true,
    });
  });
});

describe('updateAgent', () => {
  it('returns NOT_FOUND for an agent of another workspace', async () => {
    accessAs('owner');
    repo.findInWorkspace.mockResolvedValue(null);
    await expect(
      updateAgent(session, { ...createInput, agentId: 'foreign' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('updates name, responsible and permissions', async () => {
    accessAs('owner');
    await updateAgent(session, { ...createInput, agentId: 'agent-1', canManageProjects: true });
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-1',
        workspaceId: 'ws-1',
        flags: { canManageProjects: true, canManageDocuments: true },
      }),
    );
  });
});

describe('disableAgent', () => {
  it('removes membership and revokes all tokens', async () => {
    accessAs('owner');
    revokeAllUserApiTokens.mockResolvedValue(2);
    await disableAgent(session, { workspaceId: 'ws-1', agentId: 'agent-1' });
    expect(repo.disable).toHaveBeenCalledWith('ws-1', 'agent-1', expect.any(Date));
    expect(revokeAllUserApiTokens).toHaveBeenCalledWith('agent-1');
  });

  it('does nothing for an already disabled agent', async () => {
    accessAs('owner');
    repo.findInWorkspace.mockResolvedValue(agentRow({ disabledAt: new Date() }));
    await disableAgent(session, { workspaceId: 'ws-1', agentId: 'agent-1' });
    expect(repo.disable).not.toHaveBeenCalled();
    expect(revokeAllUserApiTokens).not.toHaveBeenCalled();
  });

  it('forbids a non-owner', async () => {
    accessAs('member');
    await expect(
      disableAgent(session, { workspaceId: 'ws-1', agentId: 'agent-1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('enableAgent', () => {
  it('restores membership of a disabled agent', async () => {
    accessAs('owner');
    repo.findInWorkspace.mockResolvedValue(agentRow({ disabledAt: new Date() }));
    await enableAgent(session, { workspaceId: 'ws-1', agentId: 'agent-1' });
    expect(repo.enable).toHaveBeenCalledWith('ws-1', 'agent-1', expect.any(String));
  });

  it('respects the limit', async () => {
    accessAs('owner');
    repo.findInWorkspace.mockResolvedValue(agentRow({ disabledAt: new Date() }));
    repo.countActive.mockResolvedValue(AGENTS_PER_WORKSPACE_LIMIT);
    await expect(
      enableAgent(session, { workspaceId: 'ws-1', agentId: 'agent-1' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.enable).not.toHaveBeenCalled();
  });
});

describe('listAgents', () => {
  it('is available to any member; disabled agent has no permissions', async () => {
    accessAs('member');
    repo.listByWorkspace.mockResolvedValue([
      agentRow({
        disabledAt: new Date(),
        user: { name: 'Old', image: null, workspaceMemberships: [] },
      }),
    ]);
    const [agent] = await listAgents(session, 'ws-1');
    expect(agent).toMatchObject({ name: 'Old', canManageDocuments: false });
    expect(agent?.disabledAt).toBeInstanceOf(Date);
  });
});
