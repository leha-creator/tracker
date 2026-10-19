import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = {
  list: vi.fn(),
  findRow: vi.fn(),
  listMembers: vi.fn(),
  findMember: vi.fn(),
  setArchived: vi.fn<(id: string, at: Date | null) => Promise<number>>(),
  delete: vi.fn<(id: string) => Promise<void>>(),
  transferOwnership: vi.fn<(input: Record<string, unknown>) => Promise<number>>(),
  setStorageQuota: vi.fn<(id: string, mb: number | null) => Promise<void>>(),
};

vi.mock('./system.repository', () => ({ systemRepository: repo }));

const {
  deleteWorkspaceBySystem,
  getWorkspaceForAdmin,
  setWorkspaceArchivedBySystem,
  transferWorkspaceOwnership,
} = await import('./system.service');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ws-1',
    slug: 'acme',
    name: 'Acme',
    icon: null,
    taskKey: 'ACM',
    archivedAt: null,
    createdAt: new Date('2026-01-01'),
    storageQuotaMb: null,
    members: [{ userId: 'u-1', user: { name: 'Анна', email: 'anna@example.com' } }],
    _count: { members: 3, agents: 1, projects: 2, tasks: 10 },
    ...overrides,
  };
}

function member(overrides: { role?: string; isAgent?: boolean } = {}) {
  return {
    id: 'm-2',
    role: overrides.role ?? 'member',
    user: { name: 'Борис', isAgent: overrides.isAgent ?? false },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.findRow.mockResolvedValue(row());
  repo.findMember.mockResolvedValue(member());
  repo.transferOwnership.mockResolvedValue(0);
});

describe('getWorkspaceForAdmin', () => {
  it('maps counters, owners and members', async () => {
    repo.listMembers.mockResolvedValue([
      {
        id: 'm-1',
        userId: 'u-1',
        role: 'owner',
        createdAt: new Date('2026-01-01'),
        user: { name: 'Анна', email: 'anna@example.com', image: null, isAgent: false },
      },
    ]);
    const workspace = await getWorkspaceForAdmin('ws-1');
    expect(workspace).toMatchObject({
      owners: [{ userId: 'u-1', name: 'Анна' }],
      membersCount: 3,
      agentsCount: 1,
      projectsCount: 2,
      tasksCount: 10,
      members: [{ memberId: 'm-1', role: 'owner', isAgent: false }],
    });
  });

  it('returns NOT_FOUND for an unknown workspace', async () => {
    repo.findRow.mockResolvedValue(null);
    await expect(getWorkspaceForAdmin('ghost')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('transferWorkspaceOwnership', () => {
  const input = {
    workspaceId: 'ws-1',
    newOwnerUserId: 'u-2',
    demotePreviousOwners: true,
    actorId: 'admin-1',
  };

  it('promotes the member and demotes previous owners', async () => {
    repo.transferOwnership.mockResolvedValue(1);
    await expect(transferWorkspaceOwnership(input)).resolves.toEqual({
      workspaceName: 'Acme',
      ownerName: 'Борис',
      demotedCount: 1,
    });
    expect(repo.transferOwnership).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      memberId: 'm-2',
      demotePreviousOwners: true,
    });
  });

  it('rejects an agent', async () => {
    repo.findMember.mockResolvedValue(member({ isAgent: true }));
    await expect(transferWorkspaceOwnership(input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(repo.transferOwnership).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND for a non-member', async () => {
    repo.findMember.mockResolvedValue(null);
    await expect(transferWorkspaceOwnership(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.transferOwnership).not.toHaveBeenCalled();
  });
});

describe('archive and delete', () => {
  it('reports whether the archive state changed', async () => {
    repo.setArchived.mockResolvedValue(0);
    await expect(
      setWorkspaceArchivedBySystem({ workspaceId: 'ws-1', archived: false, actorId: 'admin-1' }),
    ).resolves.toEqual({ name: 'Acme', changed: false });
    expect(repo.setArchived).toHaveBeenCalledWith('ws-1', null);
  });

  it('deletes only an archived workspace', async () => {
    await expect(
      deleteWorkspaceBySystem({ workspaceId: 'ws-1', actorId: 'admin-1' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.delete).not.toHaveBeenCalled();

    repo.findRow.mockResolvedValue(row({ archivedAt: new Date('2026-05-01') }));
    await expect(
      deleteWorkspaceBySystem({ workspaceId: 'ws-1', actorId: 'admin-1' }),
    ).resolves.toEqual({ name: 'Acme' });
    expect(repo.delete).toHaveBeenCalledWith('ws-1');
  });
});
