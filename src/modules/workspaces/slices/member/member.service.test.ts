import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceAccess, WorkspaceRole } from '@/shared/access';
import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { ForbiddenError } from '@/shared/errors';

const requireWorkspaceAccess =
  vi.fn<
    (session: AuthSession, workspaceId: string, minRole?: WorkspaceRole) => Promise<WorkspaceAccess>
  >();
const findInWorkspace = vi.fn<() => Promise<{ id: string; userId: string; role: string } | null>>();
const countOwners = vi.fn<() => Promise<number>>();
const setCanManageProjects =
  vi.fn<(ws: string, memberId: string, value: boolean) => Promise<number>>();
const updateMemberRole = vi.fn();
const removeMember = vi.fn();
const leaveOrganization = vi.fn();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: (...args: Parameters<typeof requireWorkspaceAccess>) =>
    requireWorkspaceAccess(...args),
}));
vi.mock('./member.repository', () => ({
  memberRepository: {
    findInWorkspace: () => findInWorkspace(),
    countOwners: () => countOwners(),
    setCanManageProjects: (...args: Parameters<typeof setCanManageProjects>) =>
      setCanManageProjects(...args),
    listByWorkspace: vi.fn(),
  },
}));
vi.mock('../../organization-api', () => ({
  callOrganizationApi: (call: (api: unknown, headers: Headers) => Promise<unknown>) =>
    call({ updateMemberRole, removeMember, leaveOrganization }, new Headers()),
}));

const {
  changeMemberRole,
  leaveWorkspace,
  removeMember: removeMemberService,
  setMemberPermission,
} = await import('./member.service');

const session: AuthSession = {
  user: {
    id: 'user-owner',
    email: 'owner@example.com',
    name: 'Owner',
    image: null,
    role: 'user',
    banned: false,
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
      permissions: { manageProjects: role === 'owner' },
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('changeMemberRole', () => {
  it('forbids non-owner', async () => {
    accessAs('member');
    await expect(
      changeMemberRole(session, { workspaceId: 'ws-1', memberId: 'm-2', role: 'owner' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(updateMemberRole).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND for member of another workspace', async () => {
    accessAs('owner');
    findInWorkspace.mockResolvedValue(null);
    await expect(
      changeMemberRole(session, { workspaceId: 'ws-1', memberId: 'foreign', role: 'owner' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(updateMemberRole).not.toHaveBeenCalled();
  });

  it('does not demote the last owner', async () => {
    accessAs('owner');
    findInWorkspace.mockResolvedValue({ id: 'm-self', userId: 'user-owner', role: 'owner' });
    countOwners.mockResolvedValue(1);
    await expect(
      changeMemberRole(session, { workspaceId: 'ws-1', memberId: 'm-self', role: 'member' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(updateMemberRole).not.toHaveBeenCalled();
  });

  it('promotes a member through the plugin', async () => {
    accessAs('owner');
    findInWorkspace.mockResolvedValue({ id: 'm-2', userId: 'user-2', role: 'member' });
    countOwners.mockResolvedValue(1);
    await changeMemberRole(session, { workspaceId: 'ws-1', memberId: 'm-2', role: 'owner' });
    expect(updateMemberRole).toHaveBeenCalledWith(
      expect.objectContaining({ body: { organizationId: 'ws-1', memberId: 'm-2', role: 'owner' } }),
    );
  });
});

describe('removeMember', () => {
  it('removes a member within the workspace', async () => {
    accessAs('owner');
    findInWorkspace.mockResolvedValue({ id: 'm-2', userId: 'user-2', role: 'member' });
    countOwners.mockResolvedValue(1);
    await removeMemberService(session, { workspaceId: 'ws-1', memberId: 'm-2' });
    expect(removeMember).toHaveBeenCalledWith(
      expect.objectContaining({ body: { organizationId: 'ws-1', memberIdOrEmail: 'm-2' } }),
    );
  });

  it('does not remove yourself', async () => {
    accessAs('owner');
    findInWorkspace.mockResolvedValue({ id: 'm-self', userId: 'user-owner', role: 'owner' });
    countOwners.mockResolvedValue(2);
    await expect(
      removeMemberService(session, { workspaceId: 'ws-1', memberId: 'm-self' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('leaveWorkspace', () => {
  it('forbids the last owner to leave', async () => {
    accessAs('owner');
    countOwners.mockResolvedValue(1);
    await expect(leaveWorkspace(session, { workspaceId: 'ws-1' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(leaveOrganization).not.toHaveBeenCalled();
  });

  it('lets a member leave', async () => {
    accessAs('member');
    countOwners.mockResolvedValue(1);
    await leaveWorkspace(session, { workspaceId: 'ws-1' });
    expect(leaveOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ body: { organizationId: 'ws-1' } }),
    );
  });
});

describe('setMemberPermission', () => {
  const input = {
    workspaceId: 'ws-1',
    memberId: 'm-2',
    permission: 'manageProjects' as const,
    value: true,
  };

  it('forbids non-owner', async () => {
    accessAs('member');
    await expect(setMemberPermission(session, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(setCanManageProjects).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND for member of another workspace', async () => {
    accessAs('owner');
    findInWorkspace.mockResolvedValue(null);
    await expect(setMemberPermission(session, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(setCanManageProjects).not.toHaveBeenCalled();
  });

  it('rejects configuring an owner', async () => {
    accessAs('owner');
    findInWorkspace.mockResolvedValue({ id: 'm-2', userId: 'user-2', role: 'owner' });
    await expect(setMemberPermission(session, input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(setCanManageProjects).not.toHaveBeenCalled();
  });

  it('grants the permission to a member', async () => {
    accessAs('owner');
    findInWorkspace.mockResolvedValue({ id: 'm-2', userId: 'user-2', role: 'member' });
    setCanManageProjects.mockResolvedValue(1);
    await setMemberPermission(session, input);
    expect(setCanManageProjects).toHaveBeenCalledWith('ws-1', 'm-2', true);
  });
});
