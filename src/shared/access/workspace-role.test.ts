import { describe, expect, it } from 'vitest';

import {
  hasWorkspaceRole,
  parseWorkspaceRole,
  resolveWorkspacePermissions,
} from './workspace-role';

describe('parseWorkspaceRole', () => {
  it.each(['owner', 'member'] as const)('accepts %s', (role) => {
    expect(parseWorkspaceRole(role)).toBe(role);
  });

  it.each([null, undefined, '', 'admin', 'OWNER', 'owner,member'])(
    'returns null for unknown value %s',
    (value) => {
      expect(parseWorkspaceRole(value)).toBeNull();
    },
  );
});

describe('hasWorkspaceRole', () => {
  it('owner satisfies any role', () => {
    expect(hasWorkspaceRole('owner', 'owner')).toBe(true);
    expect(hasWorkspaceRole('owner', 'member')).toBe(true);
  });

  it('member satisfies only member', () => {
    expect(hasWorkspaceRole('member', 'member')).toBe(true);
    expect(hasWorkspaceRole('member', 'owner')).toBe(false);
  });
});

describe('resolveWorkspacePermissions', () => {
  it('owner manages projects even without the flag', () => {
    expect(resolveWorkspacePermissions('owner', { canManageProjects: false })).toEqual({
      manageProjects: true,
    });
  });

  it('member without the flag cannot manage projects', () => {
    expect(resolveWorkspacePermissions('member', { canManageProjects: false })).toEqual({
      manageProjects: false,
    });
  });

  it('member with the flag manages projects', () => {
    expect(resolveWorkspacePermissions('member', { canManageProjects: true })).toEqual({
      manageProjects: true,
    });
  });
});
