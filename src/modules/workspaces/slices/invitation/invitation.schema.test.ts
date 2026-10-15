import { describe, expect, it } from 'vitest';

import { inviteMemberSchema } from './invitation.schema';

describe('inviteMemberSchema', () => {
  it('normalizes email and defaults role to member', () => {
    expect(inviteMemberSchema.parse({ workspaceId: 'ws', email: '  Bob@Example.COM ' })).toEqual({
      workspaceId: 'ws',
      email: 'bob@example.com',
      role: 'member',
    });
  });

  it('accepts owner role', () => {
    expect(
      inviteMemberSchema.parse({ workspaceId: 'ws', email: 'bob@example.com', role: 'owner' }).role,
    ).toBe('owner');
  });

  it('rejects unknown role and invalid email', () => {
    expect(
      inviteMemberSchema.safeParse({ workspaceId: 'ws', email: 'bob@example.com', role: 'admin' })
        .success,
    ).toBe(false);
    expect(inviteMemberSchema.safeParse({ workspaceId: 'ws', email: 'not-an-email' }).success).toBe(
      false,
    );
  });
});
