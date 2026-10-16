import { describe, expect, it } from 'vitest';

import {
  clearAdminUserFilters,
  defaultAdminUserListQuery,
  hasActiveAdminUserFilters,
  parseAdminUserListParams,
  patchAdminUserListQuery,
  serializeAdminUserListParams,
  toggleAdminUserSort,
} from './admin-user-query';

describe('parseAdminUserListParams', () => {
  it('returns defaults for empty params', () => {
    expect(parseAdminUserListParams({})).toEqual(defaultAdminUserListQuery());
    expect(defaultAdminUserListQuery()).toMatchObject({ sort: 'created', dir: 'desc', page: 1 });
  });

  it('parses valid params', () => {
    expect(
      parseAdminUserListParams({
        q: '  Иван   Петров ',
        role: 'admin',
        status: 'banned',
        sort: 'email',
        dir: 'desc',
        page: '3',
      }),
    ).toEqual({
      q: 'Иван Петров',
      role: 'admin',
      status: 'banned',
      sort: 'email',
      dir: 'desc',
      page: 3,
    });
  });

  it('drops invalid values', () => {
    expect(
      parseAdminUserListParams({
        role: 'root',
        status: 'deleted',
        sort: 'password',
        dir: 'up',
        page: '0',
      }),
    ).toEqual(defaultAdminUserListQuery());
    expect(parseAdminUserListParams({ page: '-1' }).page).toBe(1);
    expect(parseAdminUserListParams({ page: '1e3' }).page).toBe(1);
  });

  it('uses default direction of the chosen sort', () => {
    expect(parseAdminUserListParams({ sort: 'name' }).dir).toBe('asc');
  });

  it('takes the first value of repeated params and truncates long search', () => {
    expect(parseAdminUserListParams({ role: ['user', 'admin'] }).role).toBe('user');
    expect(parseAdminUserListParams({ q: 'x'.repeat(500) }).q).toHaveLength(100);
  });
});

describe('serializeAdminUserListParams', () => {
  it('omits defaults', () => {
    expect(serializeAdminUserListParams(defaultAdminUserListQuery())).toBe('');
  });

  it('round-trips through parse', () => {
    const query = parseAdminUserListParams({
      q: 'ivan',
      role: 'user',
      status: 'active',
      sort: 'name',
      dir: 'desc',
      page: '2',
    });
    const serialized = serializeAdminUserListParams(query);
    expect(serialized).toBe('q=ivan&role=user&status=active&sort=name&dir=desc&page=2');
    expect(parseAdminUserListParams(Object.fromEntries(new URLSearchParams(serialized)))).toEqual(
      query,
    );
  });
});

describe('patchAdminUserListQuery', () => {
  it('resets page on filter change and keeps explicit page', () => {
    const query = { ...defaultAdminUserListQuery(), page: 4 };
    expect(patchAdminUserListQuery(query, { role: 'admin' }).page).toBe(1);
    expect(patchAdminUserListQuery(query, { page: 5 }).page).toBe(5);
  });
});

describe('toggleAdminUserSort', () => {
  it('flips direction for the same column and uses default for another', () => {
    const query = defaultAdminUserListQuery();
    expect(toggleAdminUserSort(query, 'created')).toMatchObject({ sort: 'created', dir: 'asc' });
    expect(toggleAdminUserSort(query, 'name')).toMatchObject({ sort: 'name', dir: 'asc' });
  });
});

describe('filters helpers', () => {
  it('detects and clears active filters, keeping sort', () => {
    const query = {
      ...defaultAdminUserListQuery(),
      q: 'a',
      status: 'banned' as const,
      sort: 'name' as const,
      page: 3,
    };
    expect(hasActiveAdminUserFilters(defaultAdminUserListQuery())).toBe(false);
    expect(hasActiveAdminUserFilters(query)).toBe(true);
    expect(clearAdminUserFilters(query)).toMatchObject({
      q: '',
      role: null,
      status: null,
      sort: 'name',
      page: 1,
    });
  });
});
