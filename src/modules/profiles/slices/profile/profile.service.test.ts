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
  profile: { position: string | null; bio: string | null } | null;
}

const findUser = vi.fn<(userId: string) => Promise<UserRow | null>>();
const findCards = vi.fn<(ids: readonly string[]) => Promise<unknown[]>>();
const updateFields =
  vi.fn<
    (userId: string, fields: { position: string | null; bio: string | null }) => Promise<void>
  >();

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
    isAgent: false,
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
    profile: { position: 'Дизайнер', bio: null },
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
  it('updates position and bio', async () => {
    await updateProfile(session, updateProfileSchema.parse({ position: ' Тимлид ', bio: '' }));
    expect(updateFields).toHaveBeenCalledWith('user-1', { position: 'Тимлид', bio: null });
  });

  it('does nothing without changes', async () => {
    await updateProfile(session, updateProfileSchema.parse({ position: 'Дизайнер' }));
    expect(updateFields).not.toHaveBeenCalled();
  });
});

describe('updateProfileSchema', () => {
  it('rejects a long position', () => {
    const result = updateProfileSchema.safeParse({ position: 'x'.repeat(81) });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(['position']);
  });
});

describe('getProfileCards', () => {
  it('returns cards by user id', async () => {
    findCards.mockResolvedValue([
      {
        id: 'user-2',
        name: 'Борис',
        image: '/api/idp-avatar/user-2?v=1',
        profile: { position: 'QA', bio: 'О себе' },
      },
    ]);
    const cards = await getProfileCards(['user-2', 'user-2']);
    expect(findCards).toHaveBeenCalledWith(['user-2']);
    expect(cards.get('user-2')).toEqual({
      userId: 'user-2',
      name: 'Борис',
      image: '/api/idp-avatar/user-2?v=1',
      position: 'QA',
      bio: 'О себе',
    });
  });
});
