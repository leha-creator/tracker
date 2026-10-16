import 'server-only';

import { prisma } from '@/shared/db';

/** providerId аккаунта Better Auth для входа через GitHub. */
export const GITHUB_PROVIDER_ID = 'github';

// Таблица Account принадлежит Better Auth: читаем её своим репозиторием (как admin читает User),
// изменения — только через auth.api (linkSocial / unlinkAccount).
export const identityRepository = {
  /** Привязанный GitHub-аккаунт пользователя: id строки Account и id пользователя GitHub. */
  findByUser(userId: string) {
    return prisma.account.findFirst({
      where: { userId, providerId: GITHUB_PROVIDER_ID },
      select: { id: true, accountId: true },
    });
  },

  /** Пользователи Tasker по id пользователей GitHub (Account.accountId — строка). */
  findByGithubIds(githubIds: string[]) {
    return prisma.account.findMany({
      where: { providerId: GITHUB_PROVIDER_ID, accountId: { in: githubIds } },
      select: { userId: true, accountId: true },
    });
  },
};
