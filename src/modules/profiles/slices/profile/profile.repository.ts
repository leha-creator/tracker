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
        profile: { select: { position: true, bio: true, avatarKey: true } },
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

  async findAvatarKey(userId: string): Promise<string | null> {
    const row = await prisma.userProfile.findUnique({
      where: { userId },
      select: { avatarKey: true },
    });
    return row?.avatarKey ?? null;
  },

  /** Новый ключ фото (null — убрать); возвращает прежний — его объект удаляет сервис. */
  setAvatarKey(userId: string, avatarKey: string | null): Promise<string | null> {
    return prisma.$transaction(async (tx) => {
      const current = await tx.userProfile.findUnique({
        where: { userId },
        select: { avatarKey: true },
      });
      await tx.userProfile.upsert({
        where: { userId },
        create: { userId, avatarKey },
        update: { avatarKey },
      });
      return current?.avatarKey ?? null;
    });
  },
};
