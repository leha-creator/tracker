import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/db';

import type { AllWorkspacesQuery } from './system.dto';

/** Счётчики и владельцы — одним запросом со строкой пространства. */
const rowSelect = {
  id: true,
  slug: true,
  name: true,
  icon: true,
  taskKey: true,
  archivedAt: true,
  createdAt: true,
  storageQuotaMb: true,
  members: {
    where: { role: 'owner' },
    orderBy: { createdAt: 'asc' },
    select: { userId: true, user: { select: { name: true, email: true } } },
  },
  _count: {
    select: {
      members: { where: { user: { isAgent: false } } },
      agents: true,
      projects: { where: { archivedAt: null } },
      tasks: { where: { archivedAt: null } },
    },
  },
} satisfies Prisma.WorkspaceSelect;

export type AdminWorkspaceRow = Prisma.WorkspaceGetPayload<{ select: typeof rowSelect }>;

export function buildWorkspaceWhere(query: AllWorkspacesQuery): Prisma.WorkspaceWhereInput {
  const and: Prisma.WorkspaceWhereInput[] = [];
  if (query.q) {
    and.push({
      OR: [
        { name: { contains: query.q, mode: 'insensitive' } },
        { slug: { contains: query.q, mode: 'insensitive' } },
        { taskKey: { contains: query.q, mode: 'insensitive' } },
      ],
    });
  }
  if (query.archived === 'active') and.push({ archivedAt: null });
  if (query.archived === 'archived') and.push({ archivedAt: { not: null } });
  return { AND: and };
}

/**
 * Системные операции над пространствами для администратора ресурса. Роли меняются напрямую,
 * в обход плагина organization: его API требует членства действующего пользователя.
 */
export const systemRepository = {
  async countAll(): Promise<{ total: number; archived: number }> {
    const [total, archived] = await prisma.$transaction([
      prisma.workspace.count(),
      prisma.workspace.count({ where: { archivedAt: { not: null } } }),
    ]);
    return { total, archived };
  },

  async list(query: AllWorkspacesQuery): Promise<{ rows: AdminWorkspaceRow[]; total: number }> {
    const where = buildWorkspaceWhere(query);
    const field = query.sort === 'name' ? 'name' : 'createdAt';
    const [total, rows] = await prisma.$transaction([
      prisma.workspace.count({ where }),
      prisma.workspace.findMany({
        where,
        orderBy: [{ [field]: query.dir }, { id: query.dir }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: rowSelect,
      }),
    ]);
    return { rows, total };
  },

  findRow(workspaceId: string) {
    return prisma.workspace.findUnique({ where: { id: workspaceId }, select: rowSelect });
  },

  listMembers(workspaceId: string) {
    return prisma.workspaceMember.findMany({
      where: { workspaceId },
      orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        userId: true,
        role: true,
        createdAt: true,
        user: { select: { name: true, email: true, image: true, isAgent: true } },
      },
    });
  },

  findMember(workspaceId: string, userId: string) {
    return prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { id: true, role: true, user: { select: { name: true, isAgent: true } } },
    });
  },

  async setArchived(workspaceId: string, archivedAt: Date | null): Promise<number> {
    const { count } = await prisma.workspace.updateMany({
      where: { id: workspaceId, archivedAt: archivedAt ? null : { not: null } },
      data: { archivedAt },
    });
    return count;
  },

  /** Удаление с каскадом по схеме (участники, проекты, задачи, документы, токены…). */
  async delete(workspaceId: string): Promise<void> {
    await prisma.workspace.delete({ where: { id: workspaceId } });
  },

  /**
   * Новый владелец и (по выбору) понижение остальных владельцев — одной транзакцией.
   * Возвращает число пониженных.
   */
  transferOwnership(input: {
    workspaceId: string;
    memberId: string;
    demotePreviousOwners: boolean;
  }): Promise<number> {
    return prisma.$transaction(async (tx) => {
      await tx.workspaceMember.update({ where: { id: input.memberId }, data: { role: 'owner' } });
      if (!input.demotePreviousOwners) return 0;
      const { count } = await tx.workspaceMember.updateMany({
        where: { workspaceId: input.workspaceId, role: 'owner', id: { not: input.memberId } },
        data: { role: 'member' },
      });
      return count;
    });
  },

  async setStorageQuota(workspaceId: string, storageQuotaMb: number | null): Promise<void> {
    await prisma.workspace.update({ where: { id: workspaceId }, data: { storageQuotaMb } });
  },
};
