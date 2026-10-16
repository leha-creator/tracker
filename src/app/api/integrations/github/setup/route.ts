import type { NextRequest } from 'next/server';

import {
  completeInstallation,
  INVALID_INSTALL_STATE,
  isGithubEnabled,
  peekInstallStateSlug,
  setupCallbackSchema,
} from '@/modules/integrations/github';
import { getSession } from '@/shared/auth';
import { getEnv } from '@/shared/env';
import { AppError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

const log = createLogger('api.github.setup');

/** Код ошибки для страницы настроек (`?error=`): детали не передаются в URL. */
type SetupErrorCode = 'state' | 'forbidden' | 'failed';

function redirectTo(path: string): Response {
  // Абсолютный адрес от BETTER_AUTH_URL: за прокси request.url указывает на внутренний хост.
  const location = new URL(path, getEnv().BETTER_AUTH_URL).toString();
  return new Response(null, {
    status: 303,
    headers: { Location: location, 'Cache-Control': 'private, no-store' },
  });
}

function settingsPath(slug: string | null, query: string): string {
  return slug ? `/w/${slug}/settings/github?${query}` : '/';
}

/**
 * Setup URL GitHub App: сюда GitHub возвращает после установки (`installation_id`,
 * `setup_action`, `state`). Подключение проверяет state и доступ пользователя к установке,
 * затем — 303 на настройки GitHub пространства. Ошибки — `?error=<код>`, без деталей.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!isGithubEnabled()) return new Response('Not Found', { status: 404 });

  const session = await getSession();
  if (!session) {
    const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    return redirectTo(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const parsed = setupCallbackSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    log.warn({ userId: session.user.id }, '[github.setup] invalid callback params');
    return redirectTo('/');
  }
  const { installation_id: installationId, setup_action: setupAction, state } = parsed.data;
  // «Redirect on update» без state: доступ к репозиториям обновит вебхук installation_repositories.
  if (!state) {
    log.debug({ userId: session.user.id, installationId, setupAction }, '[github.setup] no state');
    return redirectTo('/');
  }

  const slugHint = peekInstallStateSlug(state);
  try {
    const { workspaceSlug } = await completeInstallation(session, {
      installationId,
      setupAction,
      state,
    });
    return redirectTo(settingsPath(workspaceSlug, 'connected=1'));
  } catch (error) {
    let code: SetupErrorCode = 'failed';
    if (error instanceof AppError && error.code === 'FORBIDDEN') {
      code = error.details?.reason === INVALID_INSTALL_STATE ? 'state' : 'forbidden';
    } else if (error instanceof AppError && error.code === 'NOT_FOUND') {
      code = 'forbidden';
    }
    log.warn(
      { userId: session.user.id, installationId, code, errorCode: (error as AppError).code },
      '[github.setup] failed',
    );
    return redirectTo(settingsPath(slugHint, `error=${code}`));
  }
}
