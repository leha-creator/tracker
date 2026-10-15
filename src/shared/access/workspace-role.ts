/** Роли участника пространства (плагин organization Better Auth). Чистый TS: без Prisma и Next.js. */
export const WORKSPACE_ROLES = ['owner', 'member'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

const RANK: Record<WorkspaceRole, number> = { member: 1, owner: 2 };

/**
 * Приводит значение из БД к WorkspaceRole. Неизвестное значение → null: доступ не выдаётся,
 * в отличие от глобальной роли, где безопасный дефолт — `user`.
 */
export function parseWorkspaceRole(value: string | null | undefined): WorkspaceRole | null {
  return WORKSPACE_ROLES.find((role) => role === value) ?? null;
}

/** Достаточно ли роли `actual` для действия, требующего `min`. */
export function hasWorkspaceRole(actual: WorkspaceRole, min: WorkspaceRole): boolean {
  return RANK[actual] >= RANK[min];
}

/** Права в пространстве сверх роли. Владелец имеет все права всегда. */
export const WORKSPACE_PERMISSIONS = ['manageProjects'] as const;
export type WorkspacePermission = (typeof WORKSPACE_PERMISSIONS)[number];
export type WorkspacePermissions = Record<WorkspacePermission, boolean>;

/** Флаги участника из БД (WorkspaceMember). */
export interface WorkspacePermissionFlags {
  canManageProjects: boolean;
}

/** Итоговые права участника: владельцу — всё, участнику — по выданным флагам. */
export function resolveWorkspacePermissions(
  role: WorkspaceRole,
  flags: WorkspacePermissionFlags,
): WorkspacePermissions {
  if (role === 'owner') return { manageProjects: true };
  return { manageProjects: flags.canManageProjects };
}
