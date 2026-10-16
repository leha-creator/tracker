import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/db';

import { ADMIN_USERS_PAGE_SIZE, type AdminUserListQuery } from '../../models';

/** Заблокирован сейчас: флаг стоит, и срок не истёк (истёкший бан плагин снимает только при входе). */
function bannedNow(now: Date): Prisma.UserWhereInput {
  return { banned: true, OR: [{ banExpires: null }, { banExpires: { gt: now } }] };
}

export function buildUserWhere(query: AdminUserListQuery, now: Date): Prisma.UserWhereInput {
  // Агенты пространств — служебные пользователи: в админке ресурса их нет (модуль agents).
  const and: Prisma.UserWhereInput[] = [{ isAgent: false }];
  if (query.q) {
    and.push({
      OR: [
        { name: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ],
    });
  }
  // Better Auth допускает несколько ролей через запятую — как parseGlobalRole.
  const isAdminRole: Prisma.UserWhereInput = { role: { contains: 'admin' } };
  if (query.role) and.push(query.role === 'admin' ? isAdminRole : { NOT: isAdminRole });
  if (query.status === 'banned') and.push(bannedNow(now));
  if (query.status === 'active') and.push({ NOT: bannedNow(now) });
  return { AND: and };
}

export function buildUserOrderBy(query: AdminUserListQuery): Prisma.UserOrderByWithRelationInput[] {
  const field = { created: 'createdAt', name: 'name', email: 'email' } as const;
  return [{ [field[query.sort]]: query.dir }, { id: query.dir }];
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  role: true,
  banned: true,
  banReason: true,
  banExpires: true,
  emailVerified: true,
  twoFactorEnabled: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type AdminUserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export const userRepository = {
  async list(
    query: AdminUserListQuery,
    now: Date,
  ): Promise<{ rows: AdminUserRow[]; total: number }> {
    const where = buildUserWhere(query, now);
    const [total, rows] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: buildUserOrderBy(query),
        skip: (query.page - 1) * ADMIN_USERS_PAGE_SIZE,
        take: ADMIN_USERS_PAGE_SIZE,
        select: userSelect,
      }),
    ]);
    return { rows, total };
  },

  findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        banned: true,
        banExpires: true,
        isAgent: true,
        twoFactorEnabled: true,
      },
    });
  },

  /** Сброс 2FA: секрет и резервные коды удаляются, флаг снимается — атомарно. */
  async resetTwoFactor(id: string): Promise<void> {
    await prisma.$transaction([
      prisma.twoFactor.deleteMany({ where: { userId: id } }),
      prisma.user.update({ where: { id }, data: { twoFactorEnabled: false } }),
    ]);
  },
};
