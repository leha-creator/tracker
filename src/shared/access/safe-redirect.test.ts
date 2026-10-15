import { describe, expect, it } from 'vitest';

import { safeRedirectPath } from './safe-redirect';

describe('safeRedirectPath', () => {
  it.each(['/', '/admin', '/w/acme/tasks?view=list#top'])('keeps internal path %s', (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each([
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    'javascript:alert(1)',
    'admin',
    '/foo\nbar',
    '',
    undefined,
    42,
  ])('falls back for unsafe value %j', (value) => {
    expect(safeRedirectPath(value)).toBe('/');
    expect(safeRedirectPath(value, '/home')).toBe('/home');
  });
});
