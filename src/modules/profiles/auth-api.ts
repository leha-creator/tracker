import 'server-only';

import { headers } from 'next/headers';

import { getAuth } from '@/shared/auth';
import { createLogger } from '@/shared/logger';

const log = createLogger('profiles');

/**
 * Имя и фото текущего пользователя — через Better Auth: эндпоинт обновляет и cookie-кеш сессии,
 * поэтому шапка сразу показывает новые данные.
 */
export async function updateAuthUser(fields: {
  name?: string;
  image?: string | null;
}): Promise<void> {
  try {
    await getAuth().api.updateUser({ body: fields, headers: await headers() });
  } catch (error) {
    log.error({ err: error, fields: Object.keys(fields) }, '[profiles.updateAuthUser] failed');
    throw error;
  }
}
