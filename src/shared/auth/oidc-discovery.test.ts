import { describe, expect, it } from 'vitest';

import { DISCOVERY_RETRY_MS, nextDiscoveryAction, validateDiscovery } from './oidc-discovery';

const ISSUER = 'https://auth.plwedding.ru';
const DOCUMENT = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/api/auth/oauth2/authorize`,
  token_endpoint: `${ISSUER}/api/auth/oauth2/token`,
  jwks_uri: `${ISSUER}/api/auth/jwks`,
  end_session_endpoint: `${ISSUER}/api/auth/oauth2/end-session`,
};

describe('nextDiscoveryAction', () => {
  it('waits for the first load', () => {
    expect(nextDiscoveryAction({ status: 'unknown' }, 0)).toBe('wait');
  });

  it('does nothing once ready', () => {
    expect(nextDiscoveryAction({ status: 'ready' }, 10 ** 12)).toBe('none');
  });

  it('retries in background after the retry interval', () => {
    const failed = { status: 'failed', failedAt: 1_000 } as const;
    expect(nextDiscoveryAction(failed, 1_000 + DISCOVERY_RETRY_MS - 1)).toBe('none');
    expect(nextDiscoveryAction(failed, 1_000 + DISCOVERY_RETRY_MS)).toBe('background');
  });
});

describe('validateDiscovery', () => {
  it('accepts a complete document of the configured issuer', () => {
    expect(validateDiscovery(DOCUMENT, ISSUER)).toBeNull();
  });

  it('reports missing fields and issuer mismatch', () => {
    expect(validateDiscovery({ ...DOCUMENT, jwks_uri: undefined }, ISSUER)).toBe(
      'missing jwks_uri',
    );
    expect(validateDiscovery(DOCUMENT, 'http://localhost:3005')).toBe('issuer mismatch');
    expect(validateDiscovery(null, ISSUER)).toBe('not an object');
  });
});
