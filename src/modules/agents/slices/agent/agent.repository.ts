import 'server-only';

import { prisma } from '@/shared/db';

const agentSelect = {
  userId: true,
  workspaceId: true,
  description: true,
  disabledAt: true,
  createdAt: true,
  user: {
    select: {
      name: true,
      image: true,
      workspaceMemberships: {
        select: { workspaceId: true, canManageProjects: true, canManageDocuments: true },
      },
    },
  },
  responsible: { select: { id: true, name: true } },
} as const;

export type AgentRow = NonNullable<Awaited<ReturnType<typeof agentRepository.findInWorkspace>>>;

/** Флаги прав агента: строка WorkspaceMember. */
interface AgentPermissionFlags {
  canManageProjects: boolean;
  canManageDocuments: boolean;
}

/**
 * Таблицы модуля: WorkspaceAgent и служебный User агента. Членство агента (WorkspaceMember)
 * модуль пишет сам, в обход плагина organization: у плагина нет API «добавить без приглашения»
 * (задокументированное исключение, как флаги прав в workspaces).
 */
export const agentRepository = {
  countActive(workspaceId: string): Promise<number> {
    return prisma.workspaceAgent.count({ where: { workspaceId, disabledAt: null } });
  },

  /** Участник-человек пространства (агент не может быть ответственным). */
  async isHumanMember(workspaceId: string, userId: string): Promise<boolean> {
    const row = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId, user: { isAgent: false } },
      select: { id: true },
    });
    return row !== null;
  },

  /** Создаёт пользователя-агента, членство и строку агента в одной транзакции. */
  async create(data: {
    agentId: string;
    memberId: string;
    workspaceId: string;
    name: string;
    email: string;
    image: string;
    description: string | null;
    responsibleUserId: string;
    createdById: string;
    flags: AgentPermissionFlags;
  }): Promise<void> {
    await prisma.$transaction([
      prisma.user.create({
        data: {
          id: data.agentId,
          name: data.name,
          email: data.email,
          emailVerified: false,
          image: data.image,
          isAgent: true,
        },
      }),
      prisma.workspaceMember.create({
        data: {
          id: data.memberId,
          workspaceId: data.workspaceId,
          userId: data.agentId,
          role: 'member',
          ...data.flags,
        },
      }),
      prisma.workspaceAgent.create({
        data: {
          userId: data.agentId,
          workspaceId: data.workspaceId,
          description: data.description,
          responsibleUserId: data.responsibleUserId,
          createdById: data.createdById,
        },
      }),
    ]);
  },

  listByWorkspace(workspaceId: string) {
    return prisma.workspaceAgent.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      select: agentSelect,
    });
  },

  /** Агент только внутри указанного пространства (защита от IDOR). */
  findInWorkspace(workspaceId: string, agentId: string) {
    return prisma.workspaceAgent.findFirst({
      where: { userId: agentId, workspaceId },
      select: agentSelect,
    });
  },

  /** Имя, описание, ответственный и (у включённого агента) права — в одной транзакции. */
  async update(data: {
    agentId: string;
    workspaceId: string;
    name: string;
    description: string | null;
    responsibleUserId: string;
    flags: AgentPermissionFlags;
  }): Promise<void> {
    await prisma.$transaction([
      prisma.user.update({ where: { id: data.agentId }, data: { name: data.name } }),
      prisma.workspaceAgent.update({
        where: { userId: data.agentId },
        data: { description: data.description, responsibleUserId: data.responsibleUserId },
      }),
      prisma.workspaceMember.updateMany({
        where: { workspaceId: data.workspaceId, userId: data.agentId },
        data: data.flags,
      }),
    ]);
  },

  /** Снимает членство и ставит disabledAt. Токены отзывает сервис через api-tokens. */
  async disable(workspaceId: string, agentId: string, now: Date): Promise<void> {
    await prisma.$transaction([
      prisma.workspaceMember.deleteMany({ where: { workspaceId, userId: agentId } }),
      prisma.workspaceAgent.update({ where: { userId: agentId }, data: { disabledAt: now } }),
    ]);
  },

  /** Возвращает членство (без дополнительных прав) и снимает disabledAt. */
  async enable(workspaceId: string, agentId: string, memberId: string): Promise<void> {
    await prisma.$transaction([
      prisma.workspaceMember.create({
        data: { id: memberId, workspaceId, userId: agentId, role: 'member' },
      }),
      prisma.workspaceAgent.update({ where: { userId: agentId }, data: { disabledAt: null } }),
    ]);
  },
};
