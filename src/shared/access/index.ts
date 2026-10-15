export { GLOBAL_ROLES, isAdmin, parseGlobalRole } from './global-role';
export type { GlobalRole } from './global-role';
export { requireAdmin, requireAdminOrNotFound, requireUser, requireUserOrRedirect } from './guards';
export { safeRedirectPath } from './safe-redirect';
// requireWorkspaceAccess(session, workspaceId, minRole) — этап «Рабочие пространства и доступы».
