import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AccessModule from '@/shared/access';
import { recordAuditEvent } from '@/shared/audit';
import type { AuthSession } from '@/shared/auth';
import { ForbiddenError } from '@/shared/errors';

const requireAdmin = vi.fn<() => Promise<AuthSession>>();
const saveStorageSettings = vi.fn<(input: unknown, actorId: string) => Promise<unknown>>();
const findById = vi.fn<(id: string) => Promise<unknown>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireAdmin: () => requireAdmin(),
}));
vi.mock('@/shared/resource-settings', () => ({
  getStorageSettings: () => Promise.resolve({ defaultWorkspaceQuotaMb: 500 }),
  loadResourceSettings: () =>
    Promise.resolve({ updatedAt: new Date('2026-10-01'), updatedById: 'admin-2' }),
  saveStorageSettings: (input: unknown, actorId: string) => saveStorageSettings(input, actorId),
}));
vi.mock('../user/user.repository', () => ({
  userRepository: { findById: (id: string) => findById(id) },
}));

const { getAdminResourceSettings, updateStorageSettings } = await import('./settings.service');

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
});

describe('updateStorageSettings', () => {
  it('rejects non-admins before saving', async () => {
    requireAdmin.mockRejectedValue(new ForbiddenError());
    await expect(updateStorageSettings({ defaultWorkspaceQuotaMb: 1 })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(saveStorageSettings).not.toHaveBeenCalled();
  });

  it('records nothing when nothing changed', async () => {
    saveStorageSettings.mockResolvedValue({});
    await updateStorageSettings({ defaultWorkspaceQuotaMb: null });
    expect(vi.mocked(recordAuditEvent)).not.toHaveBeenCalled();
  });

  it('records the changed quota', async () => {
    saveStorageSettings.mockResolvedValue({ defaultWorkspaceQuotaMb: '2048' });
    await updateStorageSettings({ defaultWorkspaceQuotaMb: 2048 });
    expect(vi.mocked(recordAuditEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { changes: { 'Квота по умолчанию, МБ': '2048' } },
      }),
    );
  });
});

describe('getAdminResourceSettings', () => {
  it('returns storage settings, the env quota and the author of the last change', async () => {
    findById.mockResolvedValue({ id: 'admin-2', name: 'Борис' });
    const dto = await getAdminResourceSettings();
    expect(dto.storage.defaultWorkspaceQuotaMb).toBe(500);
    expect(typeof dto.storage.envQuotaMb).toBe('number');
    expect(dto.updatedBy).toEqual({ id: 'admin-2', name: 'Борис' });
  });
});
