import 'server-only';

import { headers } from 'next/headers';

import { getAuth, type Auth } from '@/shared/auth';

import { mapOrganizationError } from './workspaces.errors';

/**
 * Вызов API плагина organization от имени текущего пользователя (заголовки запроса с cookie).
 * Ошибки плагина переводятся в доменные.
 */
export async function callOrganizationApi<T>(
  call: (api: Auth['api'], requestHeaders: Headers) => Promise<T>,
): Promise<T> {
  const requestHeaders = await headers();
  try {
    return await call(getAuth().api, requestHeaders);
  } catch (error) {
    throw mapOrganizationError(error);
  }
}
