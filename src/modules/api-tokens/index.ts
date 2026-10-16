// Публичный API модуля для серверного кода (страницы, другие модули).
// Клиентским компонентам — './client' (без server-only кода).
// Зависимости: только shared/; модуль agent-mcp аутентифицирует запросы через authenticateApiToken.
export * from './client';

export { authenticateApiToken, listMyApiTokens } from './slices/token/token.service';
export type { ApiTokenContext } from './slices/token/token.service';
