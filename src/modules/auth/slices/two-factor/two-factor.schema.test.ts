import { describe, expect, it } from 'vitest';

import { verifyBackupCodeSchema, verifyTotpSchema } from './two-factor.schema';

describe('verifyTotpSchema', () => {
  it('normalizes the code and the checkbox', () => {
    expect(verifyTotpSchema.parse({ code: '123 456', trustDevice: 'on' })).toEqual({
      code: '123456',
      trustDevice: true,
    });
    expect(verifyTotpSchema.parse({ code: '123456' }).trustDevice).toBe(false);
  });

  it('rejects codes that are not six digits', () => {
    expect(verifyTotpSchema.safeParse({ code: '12345' }).success).toBe(false);
    expect(verifyTotpSchema.safeParse({ code: 'abcdef' }).success).toBe(false);
  });
});

describe('verifyBackupCodeSchema', () => {
  it('trims the backup code', () => {
    expect(verifyBackupCodeSchema.parse({ code: ' abcde-12345 ' }).code).toBe('abcde-12345');
  });
});
