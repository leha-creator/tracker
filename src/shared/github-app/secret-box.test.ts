import { describe, expect, it } from 'vitest';

import { decryptSecret, encryptSecret } from './secret-box';

const SECRET = 'a-very-long-local-development-secret-value';

describe('secret box', () => {
  it('round-trips and uses a fresh IV every time', () => {
    const sealed = encryptSecret('-----BEGIN KEY-----\nabc\n', SECRET);
    expect(sealed).not.toContain('abc');
    expect(decryptSecret(sealed, SECRET)).toBe('-----BEGIN KEY-----\nabc\n');
    expect(encryptSecret('x', SECRET)).not.toBe(encryptSecret('x', SECRET));
  });

  it('rejects another secret, tampering and unknown format', () => {
    const sealed = encryptSecret('value', SECRET);
    expect(() => decryptSecret(sealed, `${SECRET}-other`)).toThrow();
    const parts = sealed.split('.');
    parts[3] = Buffer.from('other').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), SECRET)).toThrow();
    expect(() => decryptSecret('v2.a.b.c', SECRET)).toThrow();
  });
});
