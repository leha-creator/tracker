import { describe, expect, it } from 'vitest';

import { checkSignup, emailDomain } from './signup-policy';

const base = {
  email: 'anna@example.com',
  mode: 'open' as const,
  allowedEmailDomains: [] as string[],
  isAdminEmail: false,
  hasPendingInvitation: false,
};

describe('checkSignup', () => {
  it('allows anyone when open without domains', () => {
    expect(checkSignup(base)).toBeNull();
  });

  it('closes registration for everyone except ADMIN_EMAILS', () => {
    expect(checkSignup({ ...base, mode: 'closed' })).toBe('closed');
    expect(checkSignup({ ...base, mode: 'closed', hasPendingInvitation: true })).toBe('closed');
    expect(checkSignup({ ...base, mode: 'closed', isAdminEmail: true })).toBeNull();
  });

  it('requires an invitation in invite_only mode', () => {
    expect(checkSignup({ ...base, mode: 'invite_only' })).toBe('invite_only');
    expect(checkSignup({ ...base, mode: 'invite_only', hasPendingInvitation: true })).toBeNull();
  });

  it('checks domains case-insensitively, invitation bypasses them', () => {
    const domains = { ...base, allowedEmailDomains: ['example.com'] };
    expect(checkSignup({ ...domains, email: 'Anna@EXAMPLE.com' })).toBeNull();
    expect(checkSignup({ ...domains, email: 'anna@other.org' })).toBe('domain');
    expect(
      checkSignup({ ...domains, email: 'anna@other.org', hasPendingInvitation: true }),
    ).toBeNull();
    // Поддомен — другой домен.
    expect(checkSignup({ ...domains, email: 'anna@mail.example.com' })).toBe('domain');
  });
});

describe('emailDomain', () => {
  it('takes the part after the last @ in lower case', () => {
    expect(emailDomain('A@B@Example.COM')).toBe('example.com');
    expect(emailDomain('broken')).toBe('');
  });
});
