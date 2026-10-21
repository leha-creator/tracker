import 'server-only';

import { prisma } from '@/shared/db';

export const profileRepository = {
  /** Пользователь с профилем: для страницы своего профиля. */
  findUser(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        createdAt: true,
        profile: { select: { position: true, bio: true } },
      },
    });
  },

  /** Карточки пользователей: имя, фото, должность, описание. */
  findCards(userIds: readonly string[]) {
    return prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: {
        id: true,
        name: true,
        image: true,
        profile: { select: { position: true, bio: true } },
      },
    });
  },

  async updateFields(
    userId: string,
    fields: { position: string | null; bio: string | null },
  ): Promise<void> {
    await prisma.userProfile.upsert({
      where: { userId },
      create: { userId, ...fields },
      update: fields,
    });
  },

  /** Служебный пользователь-агент (User.isAgent): вместо фото — робот. */
  async isAgent(userId: string): Promise<boolean> {
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { isAgent: true } });
    return row?.isAgent ?? false;
  },
};
