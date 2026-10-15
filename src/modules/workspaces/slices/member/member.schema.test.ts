import { describe, expect, it } from 'vitest';

import { changeMemberRoleSchema } from './member.schema';

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
