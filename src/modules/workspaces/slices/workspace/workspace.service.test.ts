import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceAccess, WorkspaceRole } from '@/shared/access';
import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { ConflictError, ValidationError } from '@/shared/errors';

const requireWorkspaceAccess =
  vi.fn<
    (session: AuthSession, workspaceId: string, minRole?: WorkspaceRole) => Promise<WorkspaceAccess>
  >();
const isTaskKeyTaken = vi.fn<(key: string, except?: string) => Promise<boolean>>();
const setTaskKey = vi.fn<(workspaceId: string, key: string) => Promise<void>>();
const findById =
  vi.fn<
    (
      id: string,
    ) => Promise<{ id: string; slug: string; name: string; taskKey: string | null } | null>
  >();
const findByTaskKeys = vi.fn<(keys: readonly string[]) => Promise<unknown[]>>();
const createOrganization = vi.fn();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: (...args: Parameters<typeof requireWorkspaceAccess>) =>
    requireWorkspaceAccess(...args),
}));
vi.mock('@/shared/db', () => ({
  isUniqueViolation: (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002',
}));
vi.mock('./workspace.repository', () => ({
  workspaceRepository: {
    listForUser: vi.fn(),
    findById: (...args: Parameters<typeof findById>) => findById(...args),
    isTaskKeyTaken: (...args: Parameters<typeof isTaskKeyTaken>) => isTaskKeyTaken(...args),
    setTaskKey: (...args: Parameters<typeof setTaskKey>) => setTaskKey(...args),
    findByTaskKeys: (...args: Parameters<typeof findByTaskKeys>) => findByTaskKeys(...args),
  },
}));
vi.mock('../../organization-api', () => ({
  callOrganizationApi: (call: (api: unknown, headers: Headers) => Promise<unknown>) =>
    call({ createOrganization }, new Headers()),
}));

const { createWorkspace, findWorkspacesByTaskKeys, updateTaskKey } =
  await import('./workspace.service');

const session = { user: { id: 'u1' } } as AuthSession;
const uniqueViolation = Object.assign(new Error('unique'), { code: 'P2002' });

beforeEach(() => {
  vi.resetAllMocks();
  createOrganization.mockResolvedValue({ id: 'w1', slug: 'otdel-prodazh', name: 'Отдел продаж' });
  isTaskKeyTaken.mockResolvedValue(false);
  setTaskKey.mockResolvedValue();
});

describe('createWorkspace: task key', () => {
  it('assigns key suggested from name', async () => {
    await createWorkspace(session, { name: 'Отдел продаж' });
    expect(setTaskKey).toHaveBeenCalledExactlyOnceWith('w1', 'OP');
  });

  it('retries with numeric suffix on conflict', async () => {
    setTaskKey.mockRejectedValueOnce(uniqueViolation);
    isTaskKeyTaken.mockResolvedValueOnce(true); // OP2 занят — проверяется до записи
    await createWorkspace(session, { name: 'Отдел продаж' });
    expect(setTaskKey.mock.calls.map(([, key]) => key)).toEqual(['OP', 'OP3']);
  });

  it('keeps workspace without key when all attempts fail', async () => {
    setTaskKey.mockRejectedValue(uniqueViolation);
    const result = await createWorkspace(session, { name: 'Отдел продаж' });
    expect(result.id).toBe('w1');
    expect(setTaskKey).toHaveBeenCalledTimes(5);
  });

  it('does not throw on unexpected error after creation', async () => {
    setTaskKey.mockRejectedValueOnce(new Error('db down'));
    await expect(createWorkspace(session, { name: 'Отдел продаж' })).resolves.toMatchObject({
      id: 'w1',
    });
  });

  it('rejects manual key that is taken before creating workspace', async () => {
    isTaskKeyTaken.mockResolvedValueOnce(true);
    const error = await createWorkspace(session, { name: 'Team', taskKey: 'TSK' }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).fieldErrors?.taskKey).toHaveLength(1);
    expect(createOrganization).not.toHaveBeenCalled();
  });

  it('uses manual key when free', async () => {
    await createWorkspace(session, { name: 'Team', taskKey: 'TSK' });
    expect(setTaskKey).toHaveBeenCalledExactlyOnceWith('w1', 'TSK');
  });
});

describe('updateTaskKey', () => {
  beforeEach(() => {
    requireWorkspaceAccess.mockResolvedValue({} as WorkspaceAccess);
    findById.mockResolvedValue({ id: 'w1', slug: 's', name: 'n', taskKey: 'OLD' });
  });

  it('requires owner and saves normalized key', async () => {
    await expect(updateTaskKey(session, { workspaceId: 'w1', taskKey: 'new' })).resolves.toEqual({
      taskKey: 'NEW',
    });
    expect(requireWorkspaceAccess).toHaveBeenCalledWith(session, 'w1', 'owner');
    expect(setTaskKey).toHaveBeenCalledWith('w1', 'NEW');
  });

  it('skips write when unchanged', async () => {
    await updateTaskKey(session, { workspaceId: 'w1', taskKey: 'OLD' });
    expect(setTaskKey).not.toHaveBeenCalled();
  });

  it('maps unique violation to field error', async () => {
    setTaskKey.mockRejectedValueOnce(uniqueViolation);
    await expect(updateTaskKey(session, { workspaceId: 'w1', taskKey: 'TSK' })).rejects.toThrow(
      ConflictError,
    );
  });

  it('rejects invalid key', async () => {
    await expect(updateTaskKey(session, { workspaceId: 'w1', taskKey: '1' })).rejects.toThrow(
      ValidationError,
    );
  });
});

describe('findWorkspacesByTaskKeys', () => {
  it('normalizes and dedupes keys, skips empty request', async () => {
    findByTaskKeys.mockResolvedValue([{ id: 'w1', slug: 's', name: 'n', taskKey: 'TSK' }]);
    await expect(findWorkspacesByTaskKeys(['tsk', 'TSK'])).resolves.toHaveLength(1);
    expect(findByTaskKeys).toHaveBeenCalledWith(['TSK']);
    await expect(findWorkspacesByTaskKeys([])).resolves.toEqual([]);
    expect(findByTaskKeys).toHaveBeenCalledTimes(1);
  });
});
