import { serializeAdminAuditParams, type AdminAuditQuery } from '@/modules/audit/client';

export const ADMIN_ACTIVITY_PATH = '/admin/activity';

/** Адрес журнала с фильтрами (и курсором следующей страницы). */
export function adminActivityHref(
  query: Omit<AdminAuditQuery, 'cursor'>,
  cursor?: string | null,
): string {
  const params = serializeAdminAuditParams(query);
  if (cursor) params.set('cursor', cursor);
  const search = params.toString();
  return search ? `${ADMIN_ACTIVITY_PATH}?${search}` : ADMIN_ACTIVITY_PATH;
}
