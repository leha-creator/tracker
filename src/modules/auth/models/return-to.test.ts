import { describe, expect, it } from 'vitest';

import { withReturnTo } from './return-to';

describe('withReturnTo', () => {
  it('omits the root path', () => {
    expect(withReturnTo('/login/two-factor', '/')).toBe('/login/two-factor');
  });

  it('appends with ? or & and encodes the path', () => {
    expect(withReturnTo('/login/two-factor', '/w/a?task=1')).toBe(
      '/login/two-factor?returnTo=%2Fw%2Fa%3Ftask%3D1',
    );
    expect(withReturnTo('/verify-email?sent=1', '/invite/x')).toBe(
      '/verify-email?sent=1&returnTo=%2Finvite%2Fx',
    );
  });
});
