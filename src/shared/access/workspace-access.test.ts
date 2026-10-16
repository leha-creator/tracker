import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/shared/auth';

type Membership = {
  id: string;
  role: string;
  canManageProjects: boolean;
  canManageDocuments: boolean;
} | null;
type WorkspaceRow = {
  id: string;
  slug: string;
  name: string;
  members: { id: string; role: string; canManageProjects: boolean; canManageDocuments: boolean }[];
} | null;

const findMember = vi.fn<() => Promise<Membership>>();
const findWorkspace = vi.fn<() => Promise<WorkspaceRow>>();
const getSession = vi.fn<() => Promise<AuthSession | null>>();

vi.mock('@/shared/db', () => ({
  prisma: {
    workspaceMember: { findUnique: () => findMember() },
    workspace: { findUnique: () => findWorkspace() },
  },
}));
vi.mock('@/shared/auth', () => ({ getSession: () => getSession() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const { requireWorkspaceAccess, requireWorkspaceAccessBySlug, requireWorkspacePermission } =
  await import('./workspace-access');

function sessionOf(overrides: Partial<AuthSession['user']> = {}): AuthSession {
  return {
    user: {
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      image: null,
      role: 'user',
      banned: false,
      isAgent: false,
      ...overrides,
    },
    session: { id: 'session-1', expiresAt: new Date('2030-01-01') },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireWorkspaceAccess', () => {
  it('throws NOT_FOUND for non-member', async () => {
    findMember.mockResolvedValue(null);
    await expect(requireWorkspaceAccess(sessionOf(), 'ws-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws FORBIDDEN when member requires owner', async () => {
    findMember.mockResolvedValue({
      id: 'm-1',
      role: 'member',
      canManageProjects: false,
      canManageDocuments: false,
    });
    await expect(requireWorkspaceAccess(sessionOf(), 'ws-1', 'owner')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('throws FORBIDDEN for unknown role in DB', async () => {
    findMember.mockResolvedValue({
      id: 'm-1',
      role: 'admin',
      canManageProjects: false,
      canManageDocuments: false,
    });
    await expect(requireWorkspaceAccess(sessionOf(), 'ws-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('throws FORBIDDEN for banned user without DB lookup', async () => {
    await expect(requireWorkspaceAccess(sessionOf({ banned: true }), 'ws-1')).rejects.toMatchObject(
      { code: 'FORBIDDEN' },
    );
    expect(findMember).not.toHaveBeenCalled();
  });

  it('returns access for owner', async () => {
    findMember.mockResolvedValue({
      id: 'm-1',
      role: 'owner',
      canManageProjects: false,
      canManageDocuments: false,
    });
    await expect(requireWorkspaceAccess(sessionOf(), 'ws-1', 'owner')).resolves.toEqual({
      userId: 'user-1',
      workspaceId: 'ws-1',
      memberId: 'm-1',
      role: 'owner',
      permissions: { manageProjects: true, manageDocuments: true },
    });
  });
});

describe('requireWorkspaceAccessBySlug', () => {
  const workspace = { id: 'ws-1', slug: 'team', name: 'Team', icon: 'camera' };

  it('redirects to login without session', async () => {
    getSession.mockResolvedValue(null);
    await expect(requireWorkspaceAccessBySlug('team')).rejects.toThrow(
      'NEXT_REDIRECT:/login?returnTo=%2Fw%2Fteam',
    );
  });

  it('returns 404 for non-member', async () => {
    getSession.mockResolvedValue(sessionOf());
    findWorkspace.mockResolvedValue({ ...workspace, members: [] });
    await expect(requireWorkspaceAccessBySlug('team')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('returns 404 for unknown slug', async () => {
    getSession.mockResolvedValue(sessionOf());
    findWorkspace.mockResolvedValue(null);
    await expect(requireWorkspaceAccessBySlug('team')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('returns 404 when member opens owner-only page', async () => {
    getSession.mockResolvedValue(sessionOf());
    findWorkspace.mockResolvedValue({
      ...workspace,
      members: [{ id: 'm-1', role: 'member', canManageProjects: false, canManageDocuments: false }],
    });
    await expect(requireWorkspaceAccessBySlug('team', 'owner')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('returns workspace context for member', async () => {
    getSession.mockResolvedValue(sessionOf());
    findWorkspace.mockResolvedValue({
      ...workspace,
      members: [{ id: 'm-1', role: 'member', canManageProjects: false, canManageDocuments: false }],
    });
    const context = await requireWorkspaceAccessBySlug('team');
    expect(context.workspace).toEqual(workspace);
    expect(context.access).toEqual({
      userId: 'user-1',
      workspaceId: 'ws-1',
      memberId: 'm-1',
      role: 'member',
      permissions: { manageProjects: false, manageDocuments: false },
    });
  });
});

describe('requireWorkspacePermission', () => {
  it('throws NOT_FOUND for non-member', async () => {
    findMember.mockResolvedValue(null);
    await expect(
      requireWorkspacePermission(sessionOf(), 'ws-1', 'manageProjects'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws FORBIDDEN for member without the flag', async () => {
    findMember.mockResolvedValue({
      id: 'm-1',
      role: 'member',
      canManageProjects: false,
      canManageDocuments: false,
    });
    await expect(
      requireWorkspacePermission(sessionOf(), 'ws-1', 'manageProjects'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows member with the flag', async () => {
    findMember.mockResolvedValue({
      id: 'm-1',
      role: 'member',
      canManageProjects: true,
      canManageDocuments: false,
    });
    await expect(
      requireWorkspacePermission(sessionOf(), 'ws-1', 'manageProjects'),
    ).resolves.toMatchObject({
      role: 'member',
      permissions: { manageProjects: true, manageDocuments: false },
    });
  });

  it('checks manageDocuments by its own flag', async () => {
    findMember.mockResolvedValue({
      id: 'm-1',
      role: 'member',
      canManageProjects: true,
      canManageDocuments: false,
    });
    await expect(
      requireWorkspacePermission(sessionOf(), 'ws-1', 'manageDocuments'),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Недостаточно прав для управления документами',
    });

    findMember.mockResolvedValue({
      id: 'm-1',
      role: 'member',
      canManageProjects: false,
      canManageDocuments: true,
    });
    await expect(
      requireWorkspacePermission(sessionOf(), 'ws-1', 'manageDocuments'),
    ).resolves.toMatchObject({ permissions: { manageProjects: false, manageDocuments: true } });
  });

  it('allows owner without the flag', async () => {
    findMember.mockResolvedValue({
      id: 'm-1',
      role: 'owner',
      canManageProjects: false,
      canManageDocuments: false,
    });
    await expect(
      requireWorkspacePermission(sessionOf(), 'ws-1', 'manageProjects'),
    ).resolves.toMatchObject({
      role: 'owner',
      permissions: { manageProjects: true, manageDocuments: true },
    });
  });
});
