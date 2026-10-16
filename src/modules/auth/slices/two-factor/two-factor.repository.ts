import 'server-only';

import { prisma } from '@/shared/db';

export interface TwoFactorStateRow {
  twoFactorEnabled: boolean;
  /** Есть ли пароль (credential-аккаунт): без него 2FA и смена пароля недоступны. */
  hasPassword: boolean;
}

export const twoFactorRepository = {
  async findState(userId: string): Promise<TwoFactorStateRow | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        twoFactorEnabled: true,
        accounts: { where: { providerId: 'credential' }, select: { id: true }, take: 1 },
      },
    });
    if (!user) return null;
    return { twoFactorEnabled: user.twoFactorEnabled, hasPassword: user.accounts.length > 0 };
  },
};
