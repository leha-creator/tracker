// Публичный API модуля для серверного кода (страницы, другие модули).
// Клиентским компонентам — './client' (без server-only кода).
// Зависимости: agents → workspaces (через shared/access), api-tokens (отзыв токенов агента).
// От agents не зависит никто из workspaces, notifications и api-tokens: они читают
// WorkspaceAgent в своих репозиториях (задокументированное чтение чужой таблицы).
export * from './client';

export { getAgent, listAgents } from './slices/agent/agent.service';
