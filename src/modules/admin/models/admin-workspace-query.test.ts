import { describe, expect, it } from 'vitest';

import {
  defaultAdminWorkspaceListQuery,
  hasActiveAdminWorkspaceFilters,
  parseAdminWorkspaceListParams,
  serializeAdminWorkspaceListParams,
  toggleAdminWorkspaceSort,
} from './admin-workspace-query';

describe('parseAdminWorkspaceListParams', () => {
  it('falls back to defaults for invalid values', () => {
    expect(
      parseAdminWorkspaceListParams({ status: 'deleted', sort: 'size', dir: 'up', page: '0' }),
    ).toEqual(defaultAdminWorkspaceListQuery());
  });

  it('reads valid values and normalizes the search', () => {
    expect(
      parseAdminWorkspaceListParams({
        q: '  acme   corp ',
        status: 'archived',
        sort: 'name',
        dir: 'desc',
        page: '3',
      }),
    ).toEqual({ q: 'acme corp', status: 'archived', sort: 'name', dir: 'desc', page: 3 });
  });

  it('round-trips through serialize, omitting defaults', () => {
    const query = parseAdminWorkspaceListParams({ status: 'active', sort: 'name' });
    const serialized = serializeAdminWorkspaceListParams(query);
    expect(serialized).toBe('status=active&sort=name');
    expect(
      parseAdminWorkspaceListParams(Object.fromEntries(new URLSearchParams(serialized))),
    ).toEqual(query);
    expect(serializeAdminWorkspaceListParams(defaultAdminWorkspaceListQuery())).toBe('');
  });
});

describe('toggleAdminWorkspaceSort and filters', () => {
  it('flips the direction on the same column and resets the page', () => {
    const query = { ...defaultAdminWorkspaceListQuery(), page: 4 };
    expect(toggleAdminWorkspaceSort(query, 'created')).toMatchObject({ dir: 'asc', page: 1 });
    expect(toggleAdminWorkspaceSort(query, 'name')).toMatchObject({ sort: 'name', dir: 'asc' });
  });

  it('detects active filters', () => {
    expect(hasActiveAdminWorkspaceFilters(defaultAdminWorkspaceListQuery())).toBe(false);
    expect(
      hasActiveAdminWorkspaceFilters({ ...defaultAdminWorkspaceListQuery(), status: 'archived' }),
    ).toBe(true);
  });
});
