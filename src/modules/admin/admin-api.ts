import 'server-only';

import { headers } from 'next/headers';

import { getAuth, type Auth } from '@/shared/auth';

import { mapAdminError } from './admin.errors';

/**
 * Вызов API плагина admin от имени текущего администратора (заголовки запроса с cookie).
 * Ошибки плагина переводятся в доменные.
 */
export async function callAdminApi<T>(
  call: (api: Auth['api'], requestHeaders: Headers) => Promise<T>,
): Promise<T> {
  const requestHeaders = await headers();
  try {
    return await call(getAuth().api, requestHeaders);
  } catch (error) {
    throw mapAdminError(error);
  }
}
