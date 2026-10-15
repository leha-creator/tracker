import 'server-only';

import { redirect } from 'next/navigation';

import { safeRedirectPath } from '@/shared/access';
import { getSession } from '@/shared/auth';

/**
 * Для страниц входа и регистрации: вычисляет безопасный returnTo и уводит уже вошедшего
 * пользователя (проверка настоящей сессии, а не только cookie — см. src/proxy.ts).
 */
export async function resolveAuthPageReturnTo(
  searchParams: Promise<Record<string, string | string[] | undefined>>,
): Promise<string> {
  const { returnTo } = await searchParams;
  const target = safeRedirectPath(returnTo);
  if (await getSession()) redirect(target);
  return target;
}
