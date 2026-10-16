import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/shared/auth';
import { NotFoundError, ValidationError } from '@/shared/errors';

const headObject = vi.fn<(key: string) => Promise<{ size: number } | null>>();
const readObjectPrefix = vi.fn<(key: string, bytes: number) => Promise<Uint8Array>>();
const deleteObjects = vi.fn<(keys: readonly string[]) => Promise<number>>();
const createUploadPost =
  vi.fn<(input: { key: string }) => Promise<{ url: string; fields: object }>>();
const createDownloadUrl = vi.fn<(input: { key: string; contentType: string }) => Promise<string>>();
const setAvatarKey = vi.fn<(userId: string, key: string | null) => Promise<string | null>>();
const findAvatarKey = vi.fn<(userId: string) => Promise<string | null>>();
const isAgentRepo = vi.fn<(userId: string) => Promise<boolean>>().mockResolvedValue(false);
const updateAuthUser = vi.fn<(fields: { image?: string | null }) => Promise<void>>();
const sharesWorkspace = vi.fn<(a: string, b: string) => Promise<boolean>>();

vi.mock('@/shared/storage', () => ({
  headObject: (key: string) => headObject(key),
  readObjectPrefix: (key: string, bytes: number) => readObjectPrefix(key, bytes),
  deleteObjects: (keys: readonly string[]) => deleteObjects(keys),
  createUploadPost: (input: { key: string }) => createUploadPost(input),
  createDownloadUrl: (input: { key: string; contentType: string }) => createDownloadUrl(input),
}));
vi.mock('@/modules/workspaces', () => ({
  sharesWorkspace: (a: string, b: string) => sharesWorkspace(a, b),
}));
vi.mock('../../auth-api', () => ({
  updateAuthUser: (fields: { image?: string | null }) => updateAuthUser(fields),
}));
vi.mock('../profile/profile.repository', () => ({
  profileRepository: {
    setAvatarKey: (userId: string, key: string | null) => setAvatarKey(userId, key),
    findAvatarKey: (userId: string) => findAvatarKey(userId),
    isAgent: (userId: string) => isAgentRepo(userId),
  },
}));

const {
  completeAvatarUpload,
  getAvatarDownload,
  prepareAvatarCleanup,
  removeAvatar,
  requestAvatarUpload,
} = await import('./avatar.service');

function sessionOf(id: string, role: 'user' | 'admin' = 'user'): AuthSession {
  return {
    user: {
      id,
      email: `${id}@example.com`,
      name: id,
      image: null,
      role,
      banned: false,
      isAgent: false,
    },
    session: { id: 's-1', expiresAt: new Date('2030-01-01') },
  };
}

const session = sessionOf('user-1');
const UPLOAD_ID = '0192f3a0-0000-7000-8000-000000000001';
const KEY = `users/user-1/avatar/${UPLOAD_ID}.png`;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

beforeEach(() => {
  vi.clearAllMocks();
  isAgentRepo.mockResolvedValue(false);
  deleteObjects.mockResolvedValue(0);
  headObject.mockResolvedValue({ size: 1000 });
  readObjectPrefix.mockResolvedValue(PNG);
  setAvatarKey.mockResolvedValue(null);
  createUploadPost.mockResolvedValue({ url: 'https://s3.test', fields: {} });
  createDownloadUrl.mockResolvedValue('https://s3.test/signed');
});

describe('requestAvatarUpload', () => {
  it('signs a key under the current user', async () => {
    const result = await requestAvatarUpload(session, { contentType: 'image/webp', size: 10 });
    const key = createUploadPost.mock.calls[0]![0].key;
    expect(key).toBe(`users/user-1/avatar/${result.uploadId}.webp`);
  });
});

describe('completeAvatarUpload', () => {
  const input = { uploadId: UPLOAD_ID, contentType: 'image/png' as const };

  it('saves the key, updates the user image and removes the old object', async () => {
    setAvatarKey.mockResolvedValue('users/user-1/avatar/old.jpg');
    const result = await completeAvatarUpload(session, input);

    expect(setAvatarKey).toHaveBeenCalledWith('user-1', KEY);
    expect(result.image).toBe(`/api/users/user-1/avatar?v=${UPLOAD_ID}`);
    expect(updateAuthUser).toHaveBeenCalledWith({ image: result.image });
    expect(deleteObjects).toHaveBeenCalledWith(['users/user-1/avatar/old.jpg']);
  });

  it('rejects a missing object', async () => {
    headObject.mockResolvedValue(null);
    await expect(completeAvatarUpload(session, input)).rejects.toBeInstanceOf(ValidationError);
    expect(setAvatarKey).not.toHaveBeenCalled();
  });

  it('rejects and deletes a file with a wrong signature', async () => {
    readObjectPrefix.mockResolvedValue(new Uint8Array([0x3c, 0x73, 0x76, 0x67]));
    await expect(completeAvatarUpload(session, input)).rejects.toBeInstanceOf(ValidationError);
    expect(deleteObjects).toHaveBeenCalledWith([KEY]);
    expect(setAvatarKey).not.toHaveBeenCalled();
  });

  it('rejects an oversized file', async () => {
    headObject.mockResolvedValue({ size: 3 * 1024 * 1024 });
    await expect(completeAvatarUpload(session, input)).rejects.toBeInstanceOf(ValidationError);
    expect(deleteObjects).toHaveBeenCalledWith([KEY]);
  });
});

describe('removeAvatar', () => {
  it('clears the key and image and deletes the object', async () => {
    setAvatarKey.mockResolvedValue(KEY);
    await removeAvatar(session);
    expect(setAvatarKey).toHaveBeenCalledWith('user-1', null);
    expect(updateAuthUser).toHaveBeenCalledWith({ image: null });
    expect(deleteObjects).toHaveBeenCalledWith([KEY]);
  });
});

describe('getAvatarDownload', () => {
  it('returns the robot for an agent without a storage lookup', async () => {
    isAgentRepo.mockResolvedValueOnce(true);
    await expect(getAvatarDownload(session, 'agent-1')).resolves.toEqual({
      url: '/agent-avatar.svg',
    });
    expect(findAvatarKey).not.toHaveBeenCalled();
  });

  it('allows users sharing a workspace', async () => {
    sharesWorkspace.mockResolvedValue(true);
    findAvatarKey.mockResolvedValue('users/user-2/avatar/x.jpg');
    const result = await getAvatarDownload(session, 'user-2');
    expect(result.url).toBe('https://s3.test/signed');
    expect(createDownloadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'users/user-2/avatar/x.jpg', contentType: 'image/jpeg' }),
    );
  });

  it('hides avatars of strangers', async () => {
    sharesWorkspace.mockResolvedValue(false);
    await expect(getAvatarDownload(session, 'user-2')).rejects.toBeInstanceOf(NotFoundError);
    expect(findAvatarKey).not.toHaveBeenCalled();
  });

  it('allows admins and yourself without the workspace check', async () => {
    findAvatarKey.mockResolvedValue(KEY);
    await getAvatarDownload(sessionOf('admin', 'admin'), 'user-1');
    await getAvatarDownload(session, 'user-1');
    expect(sharesWorkspace).not.toHaveBeenCalled();
  });

  it('reports a missing avatar as not found', async () => {
    sharesWorkspace.mockResolvedValue(true);
    findAvatarKey.mockResolvedValue(null);
    await expect(getAvatarDownload(session, 'user-2')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('prepareAvatarCleanup', () => {
  it('deletes the object read before the user was removed', async () => {
    findAvatarKey.mockResolvedValue(KEY);
    const cleanup = await prepareAvatarCleanup('user-1');
    expect(deleteObjects).not.toHaveBeenCalled();
    await cleanup();
    expect(deleteObjects).toHaveBeenCalledWith([KEY]);
  });
});
