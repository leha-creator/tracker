import { RequestError } from 'octokit';
import { describe, expect, it } from 'vitest';

import { ForbiddenError, InternalError, NotFoundError, ValidationError } from '@/shared/errors';

import { callGithub, mapGithubError } from './github-api';

function requestError(status: number): RequestError {
  return new RequestError('GitHub error body with private data', status, {
    request: { method: 'GET', url: 'https://api.github.com/x', headers: {} },
  });
}

describe('mapGithubError', () => {
  it.each([
    [404, NotFoundError],
    [401, ForbiddenError],
    [403, ForbiddenError],
    [422, ValidationError],
    [500, InternalError],
  ])('%i → %o', (status, ErrorClass) => {
    const mapped = mapGithubError(requestError(status), 'GET /x');
    expect(mapped).toBeInstanceOf(ErrorClass);
    expect(mapped.message).not.toContain('private data');
  });

  it('maps unknown errors to InternalError and keeps domain errors', () => {
    expect(mapGithubError(new Error('boom'), 'GET /x')).toBeInstanceOf(InternalError);
    const domain = new ValidationError('bad');
    expect(mapGithubError(domain, 'GET /x')).toBe(domain);
  });
});

describe('callGithub', () => {
  it('returns result and maps thrown errors', async () => {
    await expect(callGithub('GET /x', {}, () => Promise.resolve(1))).resolves.toBe(1);
    await expect(
      callGithub('GET /x', { installationId: 1 }, () => Promise.reject(requestError(404))),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
