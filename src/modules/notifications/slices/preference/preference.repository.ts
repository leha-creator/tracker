import 'server-only';

import { prisma } from '@/shared/db';

import type { NotificationChannels, NotificationType } from '../../models';

export const preferenceRepository = {
  /** Сохранённые настройки пользователей: userId → тип → каналы. */
  async listForUsers(
    userIds: readonly string[],
  ): Promise<Map<string, Map<NotificationType, NotificationChannels>>> {
    const rows = await prisma.notificationPreference.findMany({
      where: { userId: { in: [...userIds] } },
      select: { userId: true, type: true, inApp: true, email: true },
    });
    const result = new Map<string, Map<NotificationType, NotificationChannels>>();
    for (const row of rows) {
      const byType = result.get(row.userId) ?? new Map<NotificationType, NotificationChannels>();
      byType.set(row.type, { inApp: row.inApp, email: row.email });
      result.set(row.userId, byType);
    }
    return result;
  },

  async upsert(
    userId: string,
    type: NotificationType,
    channels: NotificationChannels,
  ): Promise<NotificationChannels> {
    const row = await prisma.notificationPreference.upsert({
      where: { userId_type: { userId, type } },
      create: { userId, type, ...channels },
      update: channels,
      select: { inApp: true, email: true },
    });
    return row;
  },
};
