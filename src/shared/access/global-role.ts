/** Глобальные роли пользователя (плагин admin Better Auth). Чистый TS: без Prisma и Next.js. */
export const GLOBAL_ROLES = ['user', 'admin'] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

/**
 * Приводит значение из БД к GlobalRole. Better Auth допускает несколько ролей через запятую;
 * неизвестное или пустое значение — безопасный дефолт `user`.
 */
export function parseGlobalRole(value: string | null | undefined): GlobalRole {
  const roles = (value ?? '').split(',').map((role) => role.trim());
  return roles.includes('admin') ? 'admin' : 'user';
}

export function isAdmin(user: { role: GlobalRole }): boolean {
  return user.role === 'admin';
}
