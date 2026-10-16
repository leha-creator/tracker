import type * as NextServer from 'next/server';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ForbiddenError, InternalError } from '@/shared/errors';

const getSession = vi.fn<() => Promise<unknown>>();
const completeInstallation = vi.fn<(...args: unknown[]) => Promise<unknown>>();
let enabled = true;

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof NextServer>()),
  // Вне запроса Next бросает: в тесте request scope нет.
  connection: () => Promise.resolve(),
}));
vi.mock('@/shared/auth', () => ({ getSession: () => getSession() }));
vi.mock('@/shared/env', () => ({
  getEnv: () => ({ BETTER_AUTH_URL: 'https://tracker.example.com', LOG_LEVEL: 'silent' }),
}));
vi.mock('@/modules/integrations/github', async () => {
  const schema =
    await import('@/modules/integrations/github/slices/installation/installation.schema');
  return {
    INVALID_INSTALL_STATE: 'invalid_install_state',
    isGithubEnabled: () => enabled,
    peekInstallStateSlug: (state: string) => (state.startsWith('team.') ? 'team' : null),
    setupCallbackSchema: schema.setupCallbackSchema,
    completeInstallation: (...args: unknown[]) => completeInstallation(...args),
  };
});

const { GET } = await import('./route');

function request(query: string) {
  return new NextRequest(`http://0.0.0.0:3000/api/integrations/github/setup${query}`);
}

beforeEach(() => {
  vi.resetAllMocks();
  enabled = true;
  getSession.mockResolvedValue({ user: { id: 'u1' } });
});

describe('GET /api/integrations/github/setup', () => {
  it('is 404 when GitHub is not configured', async () => {
    enabled = false;
    expect((await GET(request('?installation_id=1&state=x'))).status).toBe(404);
  });

  it('sends anonymous users to login and back, using the public base URL', async () => {
    getSession.mockResolvedValue(null);
    const response = await GET(request('?installation_id=1&state=x'));
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('Location')!);
    expect(location.origin).toBe('https://tracker.example.com');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('returnTo')).toBe(
      '/api/integrations/github/setup?installation_id=1&state=x',
    );
  });

  it('redirects to settings after a successful connect', async () => {
    completeInstallation.mockResolvedValue({ workspaceSlug: 'team' });
    const response = await GET(request('?installation_id=77&setup_action=install&state=team.sig'));
    expect(response.headers.get('Location')).toBe(
      'https://tracker.example.com/w/team/settings/github?connected=1',
    );
    expect(completeInstallation).toHaveBeenCalledWith(
      { user: { id: 'u1' } },
      { installationId: '77', setupAction: 'install', state: 'team.sig' },
    );
  });

  it.each([
    [new ForbiddenError('x', { details: { reason: 'invalid_install_state' } }), 'state'],
    [new ForbiddenError('x'), 'forbidden'],
    [new InternalError('x'), 'failed'],
  ])('maps errors to a code without details (%#)', async (error, code) => {
    completeInstallation.mockRejectedValue(error);
    const response = await GET(request('?installation_id=77&state=team.sig'));
    expect(response.headers.get('Location')).toBe(
      `https://tracker.example.com/w/team/settings/github?error=${code}`,
    );
  });

  it('goes home without state (redirect on update) or with invalid params', async () => {
    expect(
      (await GET(request('?installation_id=77&setup_action=update'))).headers.get('Location'),
    ).toBe('https://tracker.example.com/');
    expect((await GET(request('?installation_id=abc&state=x'))).headers.get('Location')).toBe(
      'https://tracker.example.com/',
    );
    expect(completeInstallation).not.toHaveBeenCalled();
  });
});
