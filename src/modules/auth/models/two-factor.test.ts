import { describe, expect, it } from 'vitest';

import {
  formatBackupCodesFile,
  formatTotpSecret,
  normalizeTotpCode,
  parseTotpUri,
} from './two-factor';

describe('parseTotpUri', () => {
  it('reads secret, issuer and account', () => {
    expect(
      parseTotpUri(
        'otpauth://totp/Tasker:anna%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Tasker',
      ),
    ).toEqual({ secret: 'JBSWY3DPEHPK3PXP', issuer: 'Tasker', account: 'anna@example.com' });
  });

  it('takes the issuer from the label when the parameter is missing', () => {
    expect(parseTotpUri('otpauth://totp/Tasker:anna?secret=ABC')).toMatchObject({
      issuer: 'Tasker',
      account: 'anna',
    });
  });

  it('rejects other URIs', () => {
    expect(parseTotpUri('https://example.com')).toBeNull();
    expect(parseTotpUri('otpauth://hotp/x?secret=ABC')).toBeNull();
    expect(parseTotpUri('otpauth://totp/x')).toBeNull();
    expect(parseTotpUri('not a uri')).toBeNull();
  });
});

describe('formatTotpSecret', () => {
  it('groups by four characters', () => {
    expect(formatTotpSecret('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP');
    expect(formatTotpSecret('ABCDEF')).toBe('ABCD EF');
  });
});

describe('normalizeTotpCode', () => {
  it('removes spaces and dashes', () => {
    expect(normalizeTotpCode(' 123 456 ')).toBe('123456');
    expect(normalizeTotpCode('abcde-12345')).toBe('abcde12345');
  });
});

describe('formatBackupCodesFile', () => {
  it('lists every code with the account', () => {
    const text = formatBackupCodesFile(
      ['aaaaa-11111', 'bbbbb-22222'],
      'a@example.com',
      new Date('2026-10-17T10:00:00Z'),
    );

    expect(text).toContain('Аккаунт: a@example.com');
    expect(text).toContain('Созданы: 2026-10-17');
    expect(text).toContain('aaaaa-11111\nbbbbb-22222');
  });
});
