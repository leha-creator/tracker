import { describe, expect, it } from 'vitest';

import { changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from './password.schema';

describe('forgotPasswordSchema', () => {
  it('normalizes email', () => {
    expect(forgotPasswordSchema.parse({ email: ' Ann@Example.COM ' }).email).toBe(
      'ann@example.com',
    );
  });
});

describe('resetPasswordSchema', () => {
  it('requires matching passwords', () => {
    const result = resetPasswordSchema.safeParse({
      token: 't',
      password: 'password-1',
      confirmPassword: 'password-2',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['confirmPassword']);
  });

  it('rejects short passwords and a missing token', () => {
    const result = resetPasswordSchema.safeParse({
      token: '',
      password: 'short',
      confirmPassword: 'short',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining(['token', 'password']),
    );
  });
});

describe('changePasswordSchema', () => {
  it('rejects the same password', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'password-1',
      newPassword: 'password-1',
      confirmPassword: 'password-1',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['newPassword']);
  });

  it('accepts a valid change', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'old-password',
        newPassword: 'new-password',
        confirmPassword: 'new-password',
      }).success,
    ).toBe(true);
  });
});
