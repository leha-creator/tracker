import { describe, expect, it } from 'vitest';

import { changeMemberRoleSchema, setMemberPermissionSchema } from './member.schema';

describe('changeMemberRoleSchema', () => {
  it.each(['owner', 'member'])('accepts role %s', (role) => {
    expect(
      changeMemberRoleSchema.safeParse({ workspaceId: 'ws', memberId: 'm', role }).success,
    ).toBe(true);
  });

  it.each(['admin', '', 'OWNER'])('rejects role %s', (role) => {
    expect(
      changeMemberRoleSchema.safeParse({ workspaceId: 'ws', memberId: 'm', role }).success,
    ).toBe(false);
  });
});

describe('setMemberPermissionSchema', () => {
  const base = { workspaceId: 'ws', memberId: 'm', permission: 'manageProjects' };

  it.each([
    ['true', true],
    ['false', false],
  ])('parses value %s', (value, expected) => {
    expect(setMemberPermissionSchema.parse({ ...base, value }).value).toBe(expected);
  });

  it('rejects unknown permission', () => {
    expect(
      setMemberPermissionSchema.safeParse({ ...base, permission: 'manageAll', value: 'true' })
        .success,
    ).toBe(false);
  });

  it('rejects non-boolean value', () => {
    expect(setMemberPermissionSchema.safeParse({ ...base, value: 'maybe' }).success).toBe(false);
  });
});
