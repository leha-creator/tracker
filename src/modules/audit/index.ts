// Публичный API модуля для серверного кода (страницы, модуль admin, cron).
// Клиентским компонентам — './client' (без server-only кода).
// Запись событий — не здесь, а в src/shared/audit (её вызывают и shared/auth, и модули).
export * from './client';

export { parseAdminAuditParams, parseAuditCursor } from './models';
export {
  listAdminAuditEvents,
  listMemberWorkspaceActivity,
  listMySecurityEvents,
  purgeExpiredAuditEvents,
} from './slices/event/event.service';
