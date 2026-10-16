import { describe, expect, it } from 'vitest';

import { banUserSchema, deleteUserSchema, setUserRoleSchema, userIdSchema } from './user.schema';

describe('userIdSchema', () => {
  it('accepts Better Auth ids', () => {
    expect(userIdSchema.parse({ userId: 'Xa9_-k2LmQ' })).toEqual({ userId: 'Xa9_-k2LmQ' });
  });

  it('rejects empty, long or unsafe ids', () => {
    expect(userIdSchema.safeParse({ userId: '' }).success).toBe(false);
    expect(userIdSchema.safeParse({ userId: 'a'.repeat(65) }).success).toBe(false);
    expect(userIdSchema.safeParse({ userId: 'id; DROP' }).success).toBe(false);
  });
});

describe('banUserSchema', () => {
  it('trims reason and defaults it to empty string', () => {
    expect(banUserSchema.parse({ userId: 'u1', reason: '  спам  ', duration: '7d' })).toEqual({
      userId: 'u1',
      reason: 'спам',
      duration: '7d',
    });
    expect(banUserSchema.parse({ userId: 'u1', duration: 'forever' }).reason).toBe('');
  });

  it('rejects long reason and unknown duration', () => {
    expect(
      banUserSchema.safeParse({ userId: 'u1', reason: 'x'.repeat(501), duration: '1d' }).success,
    ).toBe(false);
    expect(banUserSchema.safeParse({ userId: 'u1', duration: '1y' }).success).toBe(false);
  });
});

describe('setUserRoleSchema', () => {
  it('accepts only global roles', () => {
    expect(setUserRoleSchema.safeParse({ userId: 'u1', role: 'admin' }).success).toBe(true);
    expect(setUserRoleSchema.safeParse({ userId: 'u1', role: 'owner' }).success).toBe(false);
  });
});

describe('deleteUserSchema', () => {
  it('requires confirmation email', () => {
    expect(deleteUserSchema.safeParse({ userId: 'u1', confirmEmail: '   ' }).success).toBe(false);
    expect(deleteUserSchema.parse({ userId: 'u1', confirmEmail: ' a@b.c ' }).confirmEmail).toBe(
      'a@b.c',
    );
  });
});
