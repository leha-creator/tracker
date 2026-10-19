// Публичный API модуля для серверного кода (страницы).
// Клиентским компонентам — './client' (без server-only кода).
export * from './client';

export { parseAdminUserListParams, parseAdminWorkspaceListParams } from './models';
export { getMyImpersonation } from './slices/impersonation/impersonation.service';
export { getResourceOverview } from './slices/overview/overview.service';
export { getAdminResourceSettings } from './slices/settings/settings.service';
export { getAdminUserDetail, listAdminUsers } from './slices/user/user.service';
export { getAdminWorkspaceDetail, listAdminWorkspaces } from './slices/workspace/workspace.service';
