import { describe, expect, it } from 'vitest';

import { githubLinkErrorMessage, idpSignInErrorMessage } from './sso.messages';

describe('githubLinkErrorMessage', () => {
  it('returns null without error code', () => {
    expect(githubLinkErrorMessage(undefined)).toBeNull();
  });

  it('explains account linked to another user', () => {
    expect(githubLinkErrorMessage('account_already_linked_to_different_user')).toContain(
      'другому пользователю',
    );
  });

  it('falls back to a generic message for unknown codes', () => {
    expect(githubLinkErrorMessage('<script>')).toBe(
      'Не удалось привязать GitHub. Попробуйте ещё раз.',
    );
  });
});

describe('idpSignInErrorMessage', () => {
  it('returns null without error code', () => {
    expect(idpSignInErrorMessage(undefined)).toBeNull();
  });

  it('explains unverified email in IdP', () => {
    expect(idpSignInErrorMessage('email_not_verified')).toContain('не подтверждён');
  });

  it('explains failed implicit linking', () => {
    expect(idpSignInErrorMessage('account_not_linked')).toContain('Обратитесь к администратору');
  });

  it('falls back to a generic message for unknown codes', () => {
    expect(idpSignInErrorMessage('<script>')).toBe(
      'Не удалось войти через plwedding ID. Попробуйте ещё раз.',
    );
  });
});
