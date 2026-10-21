import 'server-only';

import { headers } from 'next/headers';

import { getAuth, getSession } from '@/shared/auth';
import { getEnv } from '@/shared/env';
import { createLogger } from '@/shared/logger';

import { LOCAL_SIGN_OUT_PATH, resolveSignOutRedirect } from '../../models';

const log = createLogger('auth.session');

/**
 * Выход: удаляет сессию tasker и возвращает адрес, куда перейти. Если пользователь входил через
 * IdP, это end_session_endpoint с id_token_hint (выход и из IdP, затем возврат на /login).
 * В журнал выход пишет IdP.
 */
export async function signOut(): Promise<string> {
  const requestHeaders = await headers();
  const session = await getSession();
  const impersonating = Boolean(session?.session.impersonatedBy);
  const result = await getAuth().api.signOut({
    headers: requestHeaders,
    body: { callbackURL: LOCAL_SIGN_OUT_PATH, disableRedirect: true },
  });
  const target = resolveSignOutRedirect({
    providerLogoutUrl: result.url,
    impersonating,
    issuer: getEnv().OIDC_ISSUER,
  });
  log.info({ viaIdp: target !== LOCAL_SIGN_OUT_PATH }, '[session.signOut] signed out');
  if (impersonating && result.url) {
    log.debug('[session.signOut] IdP logout skipped under impersonation');
  }
  return target;
}
