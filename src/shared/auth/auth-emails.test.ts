import { describe, expect, it } from 'vitest';

import {
  buildPasswordChangedEmail,
  buildPasswordResetEmail,
  buildSignUpAttemptEmail,
  buildVerificationEmail,
} from './auth-emails';

const URL = 'https://tasker.test/api/auth/reset-password/abc?callbackURL=%2Freset-password';

describe('auth emails', () => {
  it('puts the link into text and html', () => {
    const mail = buildPasswordResetEmail({ name: 'Анна', url: URL });

    expect(mail.subject).toBe('Сброс пароля — Tasker');
    expect(mail.text).toContain(URL);
    expect(mail.html).toContain(
      'href="https://tasker.test/api/auth/reset-password/abc?callbackURL=%2Freset-password"',
    );
  });

  it('escapes the user name in html', () => {
    const mail = buildVerificationEmail({ name: '<script>x</script>', url: URL });

    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.text).toContain('<script>x</script>');
  });

  it('builds the password changed and sign-up attempt emails', () => {
    const changed = buildPasswordChangedEmail({
      name: 'Анна',
      forgotPasswordUrl: 'https://tasker.test/forgot-password',
    });
    const attempt = buildSignUpAttemptEmail({
      name: 'Анна',
      loginUrl: 'https://tasker.test/login',
      forgotPasswordUrl: 'https://tasker.test/forgot-password',
    });

    expect(changed.text).toContain('https://tasker.test/forgot-password');
    expect(attempt.text).toContain('https://tasker.test/login');
    expect(attempt.subject).toBe('Попытка регистрации — Tasker');
  });
});
