import {
  serializeAdminWorkspaceListParams,
  type AdminWorkspaceListQuery,
} from '@/modules/admin/client';

export const ADMIN_WORKSPACES_PATH = '/admin/workspaces';

/** Адрес списка пространств с запросом: без параметров — просто путь раздела. */
export function adminWorkspacesHref(query: AdminWorkspaceListQuery): string {
  const search = serializeAdminWorkspaceListParams(query);
  return search ? `${ADMIN_WORKSPACES_PATH}?${search}` : ADMIN_WORKSPACES_PATH;
}
