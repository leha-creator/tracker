import 'server-only';

import { prisma } from '@/shared/db';

const invitationSelect = {
  id: true,
  workspaceId: true,
  email: true,
  role: true,
  status: true,
  expiresAt: true,
} as const;

export const invitationRepository = {
  /** Ожидающие и ещё не истёкшие приглашения пространства. */
  listPending(workspaceId: string, now: Date) {
    return prisma.workspaceInvitation.findMany({
      where: { workspaceId, status: 'pending', expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      select: { ...invitationSelect, createdAt: true, inviter: { select: { name: true } } },
    });
  },

  /** Приглашение по id — только внутри указанного пространства (защита от IDOR). */
  findInWorkspace(workspaceId: string, invitationId: string) {
    return prisma.workspaceInvitation.findFirst({
      where: { id: invitationId, workspaceId },
      select: invitationSelect,
    });
  },

  /** Приглашение для страницы адресата: с названием пространства и именем пригласившего. */
  findForRecipient(invitationId: string) {
    return prisma.workspaceInvitation.findUnique({
      where: { id: invitationId },
      select: {
        ...invitationSelect,
        workspace: { select: { name: true, slug: true } },
        inviter: { select: { name: true } },
      },
    });
  },
};
