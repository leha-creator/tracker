import { serializeAdminUserListParams, type AdminUserListQuery } from '@/modules/admin/client';

export const ADMIN_USERS_PATH = '/admin/users';

/** Адрес списка пользователей с запросом: без параметров — просто путь раздела. */
export function adminUsersHref(query: AdminUserListQuery): string {
  const search = serializeAdminUserListParams(query);
  return search ? `${ADMIN_USERS_PATH}?${search}` : ADMIN_USERS_PATH;
}
