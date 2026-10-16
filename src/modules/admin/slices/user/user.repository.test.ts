import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/db', () => ({ prisma: {} }));

const { defaultAdminUserListQuery } = await import('../../models');
const { buildUserOrderBy, buildUserWhere } = await import('./user.repository');

const NOW = new Date('2026-10-16T12:00:00.000Z');
const NO_AGENTS = { isAgent: false };
const bannedNow = { banned: true, OR: [{ banExpires: null }, { banExpires: { gt: NOW } }] };

describe('buildUserWhere', () => {
  it('hides agents by default', () => {
    expect(buildUserWhere(defaultAdminUserListQuery(), NOW)).toEqual({ AND: [NO_AGENTS] });
  });

  it('searches name and email case-insensitively', () => {
    expect(buildUserWhere({ ...defaultAdminUserListQuery(), q: 'ivan' }, NOW)).toEqual({
      AND: [
        NO_AGENTS,
        {
          OR: [
            { name: { contains: 'ivan', mode: 'insensitive' } },
            { email: { contains: 'ivan', mode: 'insensitive' } },
          ],
        },
      ],
    });
  });

  it('filters by role', () => {
    const admin = { role: { contains: 'admin' } };
    expect(buildUserWhere({ ...defaultAdminUserListQuery(), role: 'admin' }, NOW)).toEqual({
      AND: [NO_AGENTS, admin],
    });
    expect(buildUserWhere({ ...defaultAdminUserListQuery(), role: 'user' }, NOW)).toEqual({
      AND: [NO_AGENTS, { NOT: admin }],
    });
  });

  it('treats only unexpired bans as banned', () => {
    expect(buildUserWhere({ ...defaultAdminUserListQuery(), status: 'banned' }, NOW)).toEqual({
      AND: [NO_AGENTS, bannedNow],
    });
    expect(buildUserWhere({ ...defaultAdminUserListQuery(), status: 'active' }, NOW)).toEqual({
      AND: [NO_AGENTS, { NOT: bannedNow }],
    });
  });
});

describe('buildUserOrderBy', () => {
  it('sorts by the chosen column with id as tie-breaker', () => {
    expect(buildUserOrderBy(defaultAdminUserListQuery())).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
    expect(buildUserOrderBy({ ...defaultAdminUserListQuery(), sort: 'email', dir: 'asc' })).toEqual(
      [{ email: 'asc' }, { id: 'asc' }],
    );
  });
});
