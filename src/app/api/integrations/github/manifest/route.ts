import { connection, type NextRequest } from 'next/server';

import {
  completeGithubAppManifest,
  INVALID_MANIFEST_STATE,
  manifestCallbackSchema,
} from '@/modules/integrations/github';
import { getSession } from '@/shared/auth';
import { getEnv } from '@/shared/env';
import { AppError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

const log = createLogger('api.github.manifest');

const ADMIN_PAGE = '/admin/integrations';

/** Код ошибки для страницы админки (`?error=`): детали не передаются в URL. */
type ManifestErrorCode = 'state' | 'forbidden' | 'conflict' | 'failed';

function redirectTo(path: string): Response {
  // Абсолютный адрес от BETTER_AUTH_URL: за прокси request.url указывает на внутренний хост.
  const location = new URL(path, getEnv().BETTER_AUTH_URL).toString();
  return new Response(null, {
    status: 303,
    headers: { Location: location, 'Cache-Control': 'private, no-store' },
  });
}

/**
 * redirect_url манифеста GitHub App: сюда GitHub возвращает администратора после создания
 * приложения (`code`, `state`). Обмен code на ключи и сохранение — затем 303 на админку.
 */
export async function GET(request: NextRequest): Promise<Response> {
  // Только во время запроса: без этого Next пререндерит GET при сборке (Cache Components).
  await connection();
  const session = await getSession();
  if (!session) {
    const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    return redirectTo(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const parsed = manifestCallbackSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    log.warn({ userId: session.user.id }, '[github.manifest] invalid callback params');
    return redirectTo(`${ADMIN_PAGE}?error=failed`);
  }

  try {
    await completeGithubAppManifest(parsed.data);
    return redirectTo(`${ADMIN_PAGE}?created=1`);
  } catch (error) {
    let code: ManifestErrorCode = 'failed';
    if (error instanceof AppError && error.code === 'FORBIDDEN') {
      code = error.details?.reason === INVALID_MANIFEST_STATE ? 'state' : 'forbidden';
    } else if (error instanceof AppError && error.code === 'CONFLICT') {
      code = 'conflict';
    }
    log.warn(
      { userId: session.user.id, code, errorCode: (error as AppError).code },
      '[github.manifest] failed',
    );
    return redirectTo(`${ADMIN_PAGE}?error=${code}`);
  }
}
