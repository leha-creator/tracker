import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AccessModule from '@/shared/access';
import { recordAuditEvent } from '@/shared/audit';
import type { AuthSession } from '@/shared/auth';
import { ForbiddenError } from '@/shared/errors';

const requireAdmin = vi.fn<() => Promise<AuthSession>>();
const ws = {
  listAllWorkspaces: vi.fn(),
  getWorkspaceForAdmin: vi.fn(),
  setWorkspaceArchivedBySystem: vi.fn(),
  deleteWorkspaceBySystem: vi.fn(),
  transferWorkspaceOwnership: vi.fn(),
  setWorkspaceStorageQuota: vi.fn(),
};
const getStorageUsageByWorkspaces = vi.fn();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireAdmin: () => requireAdmin(),
}));
vi.mock('@/modules/workspaces', () => ws);
vi.mock('@/modules/documents', () => ({
  getStorageUsageByWorkspaces: (ids: string[]) => getStorageUsageByWorkspaces(ids) as unknown,
}));

const {
  archiveWorkspaceByAdmin,
  deleteWorkspaceByAdmin,
  listAdminWorkspaces,
  setStorageQuotaByAdmin,
  transferOwnershipByAdmin,
} = await import('./workspace.service');
const { defaultAdminWorkspaceListQuery } = await import('../../models');

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

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(adminSession);
  ws.getWorkspaceForAdmin.mockResolvedValue({ id: 'ws-1', name: 'Acme' });
  getStorageUsageByWorkspaces.mockResolvedValue(new Map());
});

describe('access', () => {
  it('rejects non-admins before touching workspaces', async () => {
    requireAdmin.mockRejectedValue(new ForbiddenError());
    await expect(archiveWorkspaceByAdmin({ workspaceId: 'ws-1' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(listAdminWorkspaces(defaultAdminWorkspaceListQuery())).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(ws.setWorkspaceArchivedBySystem).not.toHaveBeenCalled();
    expect(ws.listAllWorkspaces).not.toHaveBeenCalled();
  });
});

describe('listAdminWorkspaces', () => {
  it('adds storage usage and page count', async () => {
    ws.listAllWorkspaces.mockResolvedValue({ items: [{ id: 'ws-1' }], total: 51 });
    getStorageUsageByWorkspaces.mockResolvedValue(
      new Map([['ws-1', { usedBytes: 10, filesCount: 1, quotaBytes: 100 }]]),
    );
    const list = await listAdminWorkspaces(defaultAdminWorkspaceListQuery());
    expect(list).toMatchObject({
      items: [{ id: 'ws-1', storage: { usedBytes: 10 } }],
      total: 51,
      pageCount: 2,
    });
  });
});

describe('archive', () => {
  it('records the event only when the state changed', async () => {
    ws.setWorkspaceArchivedBySystem.mockResolvedValue({ name: 'Acme', changed: true });
    await archiveWorkspaceByAdmin({ workspaceId: 'ws-1' });
    expect(vi.mocked(recordAuditEvent)).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'admin.workspace_archived', workspaceId: 'ws-1' }),
    );

    vi.mocked(recordAuditEvent).mockClear();
    ws.setWorkspaceArchivedBySystem.mockResolvedValue({ name: 'Acme', changed: false });
    await archiveWorkspaceByAdmin({ workspaceId: 'ws-1' });
    expect(vi.mocked(recordAuditEvent)).not.toHaveBeenCalled();
  });
});

describe('deleteWorkspaceByAdmin', () => {
  it('requires the exact name', async () => {
    await expect(
      deleteWorkspaceByAdmin({ workspaceId: 'ws-1', confirmName: 'acme' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(ws.deleteWorkspaceBySystem).not.toHaveBeenCalled();
  });

  it('deletes and records the event without workspaceId', async () => {
    ws.deleteWorkspaceBySystem.mockResolvedValue({ name: 'Acme' });
    await deleteWorkspaceByAdmin({ workspaceId: 'ws-1', confirmName: 'Acme' });
    const event = vi.mocked(recordAuditEvent).mock.calls[0]?.[0];
    expect(event).toMatchObject({
      kind: 'admin.workspace_deleted',
      data: { workspaceName: 'Acme' },
    });
    expect(event).not.toHaveProperty('workspaceId');
  });
});

describe('ownership and quota', () => {
  it('records the new owner and demotion', async () => {
    ws.transferWorkspaceOwnership.mockResolvedValue({
      workspaceName: 'Acme',
      ownerName: 'Борис',
      demotedCount: 2,
    });
    await transferOwnershipByAdmin({
      workspaceId: 'ws-1',
      userId: 'u-2',
      demotePreviousOwners: true,
    });
    expect(ws.transferWorkspaceOwnership).toHaveBeenCalledWith(
      expect.objectContaining({ newOwnerUserId: 'u-2', actorId: 'admin-1' }),
    );
    expect(vi.mocked(recordAuditEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'admin.workspace_owner_changed',
        targetUserId: 'u-2',
        data: { workspaceName: 'Acme', ownerName: 'Борис', demotedPrevious: true },
      }),
    );
  });

  it('records the quota change', async () => {
    ws.setWorkspaceStorageQuota.mockResolvedValue({ name: 'Acme' });
    await setStorageQuotaByAdmin({ workspaceId: 'ws-1', quotaMb: null });
    expect(vi.mocked(recordAuditEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'admin.workspace_quota_changed',
        data: { workspaceName: 'Acme', quotaMb: null },
      }),
    );
  });
});
