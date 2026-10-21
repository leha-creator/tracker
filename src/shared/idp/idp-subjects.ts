import 'server-only';

import { OIDC_PROVIDER_ID } from '@/shared/auth';
import { prisma } from '@/shared/db';

// `sub` пользователя в IdP — Account.accountId провайдера plwedding (связь создаёт вход через
// IdP или SQL переноса пользователей). Нет связи — IdP о пользователе tasker не знает.

/** `sub` пользователя tasker в IdP или null, если связи нет. */
export async function findIdpSubject(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, providerId: OIDC_PROVIDER_ID },
    select: { accountId: true },
  });
  return account?.accountId ?? null;
}

export interface IdpSubjectUser {
  id: string;
  name: string;
  image: string | null;
}

/** Пользователи tasker по их `sub` в IdP. Неизвестные `sub` в ответ не попадают. */
export async function findUsersByIdpSubjects(
  subjects: readonly string[],
): Promise<Map<string, IdpSubjectUser>> {
  const unique = [...new Set(subjects)];
  if (unique.length === 0) return new Map();
  const accounts = await prisma.account.findMany({
    where: { providerId: OIDC_PROVIDER_ID, accountId: { in: unique } },
    select: { accountId: true, user: { select: { id: true, name: true, image: true } } },
  });
  return new Map(accounts.map((account) => [account.accountId, account.user]));
}
