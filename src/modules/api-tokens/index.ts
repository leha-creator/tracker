// Публичный API модуля для серверного кода (страницы, другие модули).
// Клиентским компонентам — './client' (без server-only кода).
// Зависимости: только shared/; agent-mcp аутентифицирует запросы через authenticateApiToken,
// agents отзывает токены отключённого агента (revokeAllUserApiTokens), agent-mcp пишет журнал
// действий (recordActivity).
export * from './client';

export { hasScope } from './models/scopes';
export {
  authenticateApiToken,
  listAgentTokens,
  listMyApiTokens,
  revokeAllUserApiTokens,
} from './slices/token/token.service';
export type { ApiTokenContext } from './slices/token/token.service';
export {
  listAgentActivity,
  listTokenActivity,
  recordActivity,
} from './slices/activity/activity.service';
export type { RecordActivityInput } from './slices/activity/activity.service';
export { parseActivityCursor } from './slices/activity/activity.schema';
