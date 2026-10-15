import { describe, expect, it } from 'vitest';

import { hasWorkspaceRole, parseWorkspaceRole } from './workspace-role';

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
