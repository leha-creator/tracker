import { describe, expect, it } from 'vitest';

import {
  buildAppManifest,
  isLocalBaseUrl,
  MANIFEST_STATE_TTL_MS,
  manifestFormUrl,
  signManifestState,
  verifyManifestState,
} from './app-manifest';
import { startAppManifestSchema } from './app-setup.schema';

const SECRET = 'a-very-long-local-development-secret-value';
const NOW = 1_800_000_000_000;

describe('buildAppManifest', () => {
  it('builds URLs, read-only permissions and webhook for a public base URL', () => {
    const manifest = buildAppManifest({
      baseUrl: 'https://tracker.example.com/',
      name: 'Tasker',
      isPublic: true,
    });
    expect(manifest).toMatchObject({
      name: 'Tasker',
      url: 'https://tracker.example.com',
      public: true,
      redirect_url: 'https://tracker.example.com/api/integrations/github/manifest',
      callback_urls: ['https://tracker.example.com/api/auth/callback/github'],
      setup_url: 'https://tracker.example.com/api/integrations/github/setup',
      setup_on_update: true,
      request_oauth_on_install: false,
      hook_attributes: { url: 'https://tracker.example.com/api/webhooks/github', active: true },
    });
    expect(Object.values(manifest.default_permissions)).toEqual(Array(4).fill('read') as string[]);
    expect(manifest.default_events).toContain('pull_request');
  });

  it('omits webhook for localhost', () => {
    const manifest = buildAppManifest({
      baseUrl: 'http://localhost:3000',
      name: 'Tasker',
      isPublic: false,
    });
    expect(manifest).not.toHaveProperty('hook_attributes');
    expect(manifest).not.toHaveProperty('default_events');
    expect(manifest.public).toBe(false);
  });
});

describe('isLocalBaseUrl', () => {
  it.each([
    ['http://localhost:3000', true],
    ['http://127.0.0.1:3000', true],
    ['http://192.168.1.10', true],
    ['http://172.20.0.1', true],
    ['http://tasker.local', true],
    ['https://tracker.example.com', false],
    ['https://172.32.0.1', false],
  ])('%s → %s', (url, expected) => {
    expect(isLocalBaseUrl(url)).toBe(expected);
  });
});

describe('manifestFormUrl', () => {
  it('targets the personal or organization form with state', () => {
    expect(manifestFormUrl(null, 'a.b')).toBe('https://github.com/settings/apps/new?state=a.b');
    expect(manifestFormUrl('acme', 'a.b')).toBe(
      'https://github.com/organizations/acme/settings/apps/new?state=a.b',
    );
  });
});

describe('manifest state', () => {
  it('round-trips for the same admin within TTL', () => {
    const state = signManifestState('u1', SECRET, NOW);
    expect(verifyManifestState(state, 'u1', SECRET, NOW + 1000)).toBe(true);
  });

  it('rejects another user, expiry, tampering and another secret', () => {
    const state = signManifestState('u1', SECRET, NOW);
    expect(verifyManifestState(state, 'u2', SECRET, NOW)).toBe(false);
    expect(verifyManifestState(state, 'u1', SECRET, NOW + MANIFEST_STATE_TTL_MS + 1)).toBe(false);
    expect(verifyManifestState(`${state}x`, 'u1', SECRET, NOW)).toBe(false);
    expect(verifyManifestState(state, 'u1', `${SECRET}-other`, NOW)).toBe(false);
    expect(verifyManifestState('garbage', 'u1', SECRET, NOW)).toBe(false);
  });
});

describe('startAppManifestSchema', () => {
  it('requires a valid organization login only for organizations', () => {
    expect(startAppManifestSchema.parse({ name: ' Tasker ', owner: 'user' })).toEqual({
      name: 'Tasker',
      owner: 'user',
      organization: null,
      isPublic: true,
    });
    expect(
      startAppManifestSchema.parse({ name: 'T', owner: 'organization', organization: 'acme-1' }),
    ).toMatchObject({ organization: 'acme-1' });
    expect(
      startAppManifestSchema.safeParse({ name: 'T', owner: 'organization', organization: '-x' })
        .success,
    ).toBe(false);
    expect(startAppManifestSchema.safeParse({ name: 'x'.repeat(35), owner: 'user' }).success).toBe(
      false,
    );
  });
});
