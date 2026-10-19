import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AccessModule from '@/shared/access';
import { recordAuditEvent } from '@/shared/audit';
import type { AuthSession } from '@/shared/auth';
import { ForbiddenError } from '@/shared/errors';

const requireAdmin = vi.fn<() => Promise<AuthSession>>();
const saveSignupPolicy = vi.fn<(input: unknown, actorId: string) => Promise<unknown>>();
const saveStorageSettings = vi.fn<(input: unknown, actorId: string) => Promise<unknown>>();
const findById = vi.fn<(id: string) => Promise<unknown>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireAdmin: () => requireAdmin(),
}));
vi.mock('@/shared/resource-settings', () => ({
  getSignupPolicy: () => Promise.resolve({ signupMode: 'open', allowedEmailDomains: [] }),
  getStorageSettings: () => Promise.resolve({ defaultWorkspaceQuotaMb: 500 }),
  loadResourceSettings: () =>
    Promise.resolve({ updatedAt: new Date('2026-10-01'), updatedById: 'admin-2' }),
  saveSignupPolicy: (input: unknown, actorId: string) => saveSignupPolicy(input, actorId),
  saveStorageSettings: (input: unknown, actorId: string) => saveStorageSettings(input, actorId),
  SIGNUP_MODE_LABELS: { open: 'Открыта', invite_only: 'Только по приглашению', closed: 'Закрыта' },
}));
vi.mock('../user/user.repository', () => ({
  userRepository: { findById: (id: string) => findById(id) },
}));

const { getAdminResourceSettings, updateSignupPolicy, updateStorageSettings } =
  await import('./settings.service');

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

const SIGNUP = { signupMode: 'closed' as const, allowedEmailDomains: ['example.com'] };

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(adminSession);
});

describe('updateSignupPolicy', () => {
  it('rejects non-admins before saving', async () => {
    requireAdmin.mockRejectedValue(new ForbiddenError());
    await expect(updateSignupPolicy(SIGNUP)).rejects.toBeInstanceOf(ForbiddenError);
    expect(saveSignupPolicy).not.toHaveBeenCalled();
  });

  it('records changed fields with labels', async () => {
    saveSignupPolicy.mockResolvedValue({
      signupMode: 'closed',
      allowedEmailDomains: 'example.com',
    });
    await updateSignupPolicy(SIGNUP);
    expect(saveSignupPolicy).toHaveBeenCalledWith(SIGNUP, 'admin-1');
    expect(saveStorageSettings).not.toHaveBeenCalled();
    expect(vi.mocked(recordAuditEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'admin.settings_changed',
        data: { changes: { Регистрация: 'Закрыта', 'Домены email': 'example.com' } },
      }),
    );
  });

  it('records nothing when nothing changed', async () => {
    saveSignupPolicy.mockResolvedValue({});
    await updateSignupPolicy(SIGNUP);
    expect(vi.mocked(recordAuditEvent)).not.toHaveBeenCalled();
  });
});

describe('updateStorageSettings', () => {
  it('saves only the storage group', async () => {
    saveStorageSettings.mockResolvedValue({ defaultWorkspaceQuotaMb: '2048' });
    await updateStorageSettings({ defaultWorkspaceQuotaMb: 2048 });
    expect(saveSignupPolicy).not.toHaveBeenCalled();
    expect(vi.mocked(recordAuditEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { changes: { 'Квота по умолчанию, МБ': '2048' } },
      }),
    );
  });
});

describe('getAdminResourceSettings', () => {
  it('returns both groups, the env quota and the author of the last change', async () => {
    findById.mockResolvedValue({ id: 'admin-2', name: 'Борис' });
    const dto = await getAdminResourceSettings();
    expect(dto.signup.signupMode).toBe('open');
    expect(dto.storage.defaultWorkspaceQuotaMb).toBe(500);
    expect(typeof dto.storage.envQuotaMb).toBe('number');
    expect(dto.updatedBy).toEqual({ id: 'admin-2', name: 'Борис' });
  });
});
