import { describe, expect, it } from 'vitest';

import { githubSignInErrorMessage } from './social.messages';

describe('githubSignInErrorMessage', () => {
  it('returns null without error code', () => {
    expect(githubSignInErrorMessage(undefined)).toBeNull();
  });

  it('explains not linked account', () => {
    expect(githubSignInErrorMessage('account_not_linked')).toContain('привяжите GitHub в профиле');
  });

  it('falls back to a generic message for unknown codes', () => {
    expect(githubSignInErrorMessage('<script>')).toBe(
      'Не удалось войти через GitHub. Попробуйте ещё раз.',
    );
  });
});
