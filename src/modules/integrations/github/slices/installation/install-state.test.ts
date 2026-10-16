import { describe, expect, it } from 'vitest';

import { INSTALL_STATE_TTL_MS, signInstallState, verifyInstallState } from './install-state';

const SECRET = 'a-very-long-local-development-secret-value';
const NOW = 1_800_000_000_000;
const input = { workspaceId: 'w1', workspaceSlug: 'team', userId: 'u1' };

describe('install state', () => {
  it('round-trips for the same user within TTL', () => {
    const state = signInstallState(input, SECRET, NOW);
    expect(verifyInstallState(state, 'u1', SECRET, NOW + 1000)).toEqual({
      workspaceId: 'w1',
      workspaceSlug: 'team',
    });
  });

  it('differs between calls (nonce)', () => {
    expect(signInstallState(input, SECRET, NOW)).not.toBe(signInstallState(input, SECRET, NOW));
  });

  it('rejects another user', () => {
    const state = signInstallState(input, SECRET, NOW);
    expect(verifyInstallState(state, 'u2', SECRET, NOW)).toBeNull();
  });

  it('rejects expired state', () => {
    const state = signInstallState(input, SECRET, NOW);
    expect(verifyInstallState(state, 'u1', SECRET, NOW + INSTALL_STATE_TTL_MS + 1)).toBeNull();
  });

  it('rejects state signed with another secret', () => {
    const state = signInstallState(input, `${SECRET}-other`, NOW);
    expect(verifyInstallState(state, 'u1', SECRET, NOW)).toBeNull();
  });

  it('rejects tampered payload', () => {
    const [, signature] = signInstallState(input, SECRET, NOW).split('.');
    const forged = Buffer.from(
      JSON.stringify({ w: 'w2', s: 'other', u: 'u1', e: NOW + 60_000, n: 'x' }),
    ).toString('base64url');
    expect(verifyInstallState(`${forged}.${signature}`, 'u1', SECRET, NOW)).toBeNull();
  });

  it.each(['', 'abc', 'a.b.c', '.', 'a.'])('rejects malformed state %j', (raw) => {
    expect(verifyInstallState(raw, 'u1', SECRET, NOW)).toBeNull();
  });
});
