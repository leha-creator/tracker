import 'server-only';

import { prisma } from '@/shared/db';

export const credentialsRepository = {
  /** Пользователь по email (без учёта регистра) — для записи неудачного входа в журнал. */
  async findUserIdByEmail(email: string): Promise<string | null> {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, isAgent: false },
      select: { id: true },
    });
    return user?.id ?? null;
  },
};
