import 'server-only';

import { prisma } from '@/shared/db';

export const webhookRepository = {
  /** Запоминает доставку; повтор — P2002 (isUniqueViolation). */
  async recordDelivery(id: string, event: string): Promise<void> {
    await prisma.githubWebhookDelivery.create({ data: { id, event } });
  },

  /** Обработка упала — доставку можно повторить из GitHub. */
  async forgetDelivery(id: string): Promise<void> {
    await prisma.githubWebhookDelivery.deleteMany({ where: { id } });
  },

  async purgeDeliveriesBefore(before: Date): Promise<number> {
    const { count } = await prisma.githubWebhookDelivery.deleteMany({
      where: { receivedAt: { lt: before } },
    });
    return count;
  },

  /** Установка приостановлена — события её репозиториев не обрабатываем. */
  async isInstallationSuspended(installationId: bigint): Promise<boolean> {
    const row = await prisma.githubInstallation.findUnique({
      where: { id: installationId },
      select: { suspendedAt: true },
    });
    return row?.suspendedAt != null;
  },
};
