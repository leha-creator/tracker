import { describe, expect, it } from 'vitest';

import { maskEmail } from './mask';

describe('maskEmail', () => {
  it('keeps the first character and the domain', () => {
    expect(maskEmail('john.doe@example.com')).toBe('j***@example.com');
  });

  it('fully masks values without a local part', () => {
    expect(maskEmail('@example.com')).toBe('***');
    expect(maskEmail('not-an-email')).toBe('***');
  });
});
