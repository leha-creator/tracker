import { describe, expect, it } from 'vitest';

import { signInSchema, signUpSchema } from './credentials.schema';

const validSignUp = {
  name: '  Ann  ',
  email: '  Ann@Example.COM ',
  password: 'correct-horse',
  confirmPassword: 'correct-horse',
};

describe('signInSchema', () => {
  it('normalizes email', () => {
    const result = signInSchema.parse({ email: ' Ann@Example.com ', password: 'x' });
    expect(result.email).toBe('ann@example.com');
  });

  it('rejects invalid email and empty password', () => {
    const result = signInSchema.safeParse({ email: 'nope', password: '' });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['email', 'password']));
  });
});

describe('signUpSchema', () => {
  it('trims name and normalizes email', () => {
    const result = signUpSchema.parse(validSignUp);
    expect(result).toMatchObject({ name: 'Ann', email: 'ann@example.com' });
  });

  it('reports mismatched passwords on confirmPassword', () => {
    const result = signUpSchema.safeParse({ ...validSignUp, confirmPassword: 'other-value' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['confirmPassword']);
  });

  it.each([
    ['too short', 'a'.repeat(7)],
    ['too long', 'a'.repeat(129)],
  ])('rejects password that is %s', (_label, password) => {
    const result = signUpSchema.safeParse({ ...validSignUp, password, confirmPassword: password });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['password']);
  });

  it('accepts password at the boundaries', () => {
    for (const password of ['a'.repeat(8), 'a'.repeat(128)]) {
      expect(
        signUpSchema.safeParse({ ...validSignUp, password, confirmPassword: password }).success,
      ).toBe(true);
    }
  });
});
