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
  const noFlags = { canManageProjects: false, canManageDocuments: false };

  it('owner has every permission even without flags', () => {
    expect(resolveWorkspacePermissions('owner', noFlags)).toEqual({
      manageProjects: true,
      manageDocuments: true,
    });
  });

  it('member without flags has no permissions', () => {
    expect(resolveWorkspacePermissions('member', noFlags)).toEqual({
      manageProjects: false,
      manageDocuments: false,
    });
  });

  it('member gets each permission from its own flag', () => {
    expect(resolveWorkspacePermissions('member', { ...noFlags, canManageProjects: true })).toEqual({
      manageProjects: true,
      manageDocuments: false,
    });
    expect(resolveWorkspacePermissions('member', { ...noFlags, canManageDocuments: true })).toEqual(
      { manageProjects: false, manageDocuments: true },
    );
  });
});
