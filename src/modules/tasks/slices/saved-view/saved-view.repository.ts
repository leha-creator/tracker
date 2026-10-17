import 'server-only';

import type { SavedTaskViewScope } from '@/generated/prisma/client';
import { prisma } from '@/shared/db';

const VIEW_SELECT = { id: true, name: true, params: true } as const;

/** Область фильтра: пространство и проект — null для «Моих задач» и списка пространства. */
export interface SavedViewTarget {
  scope: SavedTaskViewScope;
  workspaceId: string | null;
  projectId: string | null;
}

// Все запросы — с userId в where: чужой фильтр не находится и не меняется.
export const savedViewRepository = {
  list(userId: string, target: SavedViewTarget) {
    return prisma.savedTaskView.findMany({
      where: { userId, ...target },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: VIEW_SELECT,
    });
  },

  count(userId: string, target: SavedViewTarget) {
    return prisma.savedTaskView.count({ where: { userId, ...target } });
  },

  async isNameTaken(userId: string, target: SavedViewTarget, name: string, exceptId?: string) {
    const row = await prisma.savedTaskView.findFirst({
      where: {
        userId,
        ...target,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    return row !== null;
  },

  create(
    data: SavedViewTarget & { userId: string; name: string; params: string; position: number },
  ) {
    return prisma.savedTaskView.create({ data, select: VIEW_SELECT });
  },

  findOwn(userId: string, viewId: string) {
    return prisma.savedTaskView.findFirst({
      where: { id: viewId, userId },
      select: { ...VIEW_SELECT, scope: true, workspaceId: true, projectId: true },
    });
  },

  async rename(userId: string, viewId: string, name: string) {
    const { count } = await prisma.savedTaskView.updateMany({
      where: { id: viewId, userId },
      data: { name },
    });
    return count > 0;
  },

  async delete(userId: string, viewId: string) {
    const { count } = await prisma.savedTaskView.deleteMany({ where: { id: viewId, userId } });
    return count > 0;
  },
};
