import { describe, expect, it } from 'vitest';

import {
  parseEmailDomains,
  updateSignupPolicySchema,
  updateStorageSettingsSchema,
} from './settings.schema';

describe('parseEmailDomains', () => {
  it('splits by separators, lowercases, strips @ and dedupes', () => {
    expect(parseEmailDomains(' Example.com, @corp.ru;\nexample.com  mail.example.co.uk ')).toEqual([
      'example.com',
      'corp.ru',
      'mail.example.co.uk',
    ]);
    expect(parseEmailDomains('')).toEqual([]);
  });
});

describe('updateSignupPolicySchema', () => {
  const valid = { signupMode: 'invite_only', allowedEmailDomains: '' };

  it('accepts empty domains', () => {
    expect(updateSignupPolicySchema.parse(valid)).toEqual({
      signupMode: 'invite_only',
      allowedEmailDomains: [],
    });
  });

  it('rejects unknown modes, invalid domains and too many domains', () => {
    expect(updateSignupPolicySchema.safeParse({ ...valid, signupMode: 'maybe' }).success).toBe(
      false,
    );
    const invalid = updateSignupPolicySchema.safeParse({
      ...valid,
      allowedEmailDomains: 'example.com, http://bad, localhost',
    });
    expect(invalid.success).toBe(false);
    expect(invalid.error?.issues[0]?.message).toContain('http://bad');
    const many = Array.from({ length: 51 }, (_, i) => `d${i}.com`).join(' ');
    expect(
      updateSignupPolicySchema.safeParse({ ...valid, allowedEmailDomains: many }).success,
    ).toBe(false);
  });
});

describe('updateStorageSettingsSchema', () => {
  it('treats an empty quota as the environment default', () => {
    expect(updateStorageSettingsSchema.parse({ defaultWorkspaceQuotaMb: '' })).toEqual({
      defaultWorkspaceQuotaMb: null,
    });
  });

  it('parses quota as an integer in range', () => {
    expect(
      updateStorageSettingsSchema.parse({ defaultWorkspaceQuotaMb: '2048' })
        .defaultWorkspaceQuotaMb,
    ).toBe(2048);
    for (const quota of ['0', '1.5', '-1', '2000000', 'много']) {
      expect(
        updateStorageSettingsSchema.safeParse({ defaultWorkspaceQuotaMb: quota }).success,
      ).toBe(false);
    }
  });
});
