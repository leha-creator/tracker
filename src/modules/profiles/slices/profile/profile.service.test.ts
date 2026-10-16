import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/shared/auth';

import { updateProfileSchema } from './profile.schema';

interface UserRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  createdAt: Date;
  profile: { position: string | null; bio: string | null; avatarKey: string | null } | null;
}

const findUser = vi.fn<(userId: string) => Promise<UserRow | null>>();
const findCards = vi.fn<(ids: readonly string[]) => Promise<unknown[]>>();
const updateFields =
  vi.fn<
    (userId: string, fields: { position: string | null; bio: string | null }) => Promise<void>
  >();
const updateAuthUser = vi.fn<(fields: { name?: string }) => Promise<void>>();

vi.mock('../../auth-api', () => ({
  updateAuthUser: (fields: { name?: string }) => updateAuthUser(fields),
}));
vi.mock('./profile.repository', () => ({
  profileRepository: {
    findUser: (userId: string) => findUser(userId),
    findCards: (ids: readonly string[]) => findCards(ids),
    updateFields: (userId: string, fields: { position: string | null; bio: string | null }) =>
      updateFields(userId, fields),
  },
}));

const { getMyProfile, getProfileCards, updateProfile } = await import('./profile.service');

const session: AuthSession = {
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Анна',
    image: null,
    role: 'user',
    banned: false,
  },
  session: { id: 's-1', expiresAt: new Date('2030-01-01') },
};

function userRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'user-1',
    name: 'Анна',
    email: 'user@example.com',
    image: null,
    role: 'user',
    createdAt: new Date('2026-01-01'),
    profile: { position: 'Дизайнер', bio: null, avatarKey: null },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findUser.mockResolvedValue(userRow());
});

describe('getMyProfile', () => {
  it('drops foreign image urls', async () => {
    findUser.mockResolvedValue(userRow({ image: 'https://evil.example/x.png' }));
    const profile = await getMyProfile(session);
    expect(profile).toMatchObject({ image: null, position: 'Дизайнер', globalRole: 'user' });
  });
});

describe('updateProfile', () => {
  it('updates only the profile fields when the name is the same', async () => {
    await updateProfile(
      session,
      updateProfileSchema.parse({ name: ' Анна ', position: 'Тимлид', bio: '' }),
    );
    expect(updateAuthUser).not.toHaveBeenCalled();
    expect(updateFields).toHaveBeenCalledWith('user-1', { position: 'Тимлид', bio: null });
  });

  it('renames through Better Auth', async () => {
    await updateProfile(
      session,
      updateProfileSchema.parse({ name: 'Анна Петрова', position: 'Дизайнер' }),
    );
    expect(updateAuthUser).toHaveBeenCalledWith({ name: 'Анна Петрова' });
    expect(updateFields).not.toHaveBeenCalled();
  });

  it('does nothing without changes', async () => {
    await updateProfile(session, updateProfileSchema.parse({ name: 'Анна', position: 'Дизайнер' }));
    expect(updateAuthUser).not.toHaveBeenCalled();
    expect(updateFields).not.toHaveBeenCalled();
  });
});

describe('updateProfileSchema', () => {
  it('rejects a short name and a long position', () => {
    const result = updateProfileSchema.safeParse({ name: 'А', position: 'x'.repeat(81) });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(['name', 'position']);
  });
});

describe('getProfileCards', () => {
  it('returns cards by user id', async () => {
    findCards.mockResolvedValue([
      {
        id: 'user-2',
        name: 'Борис',
        image: '/api/users/user-2/avatar?v=1',
        profile: { position: 'QA', bio: 'О себе' },
      },
    ]);
    const cards = await getProfileCards(['user-2', 'user-2']);
    expect(findCards).toHaveBeenCalledWith(['user-2']);
    expect(cards.get('user-2')).toEqual({
      userId: 'user-2',
      name: 'Борис',
      image: '/api/users/user-2/avatar?v=1',
      position: 'QA',
      bio: 'О себе',
    });
  });
});
