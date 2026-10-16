/**
 * Агент пространства — служебный пользователь (User.isAgent) с членством в одном пространстве.
 * Чистый TS без зависимостей: файл экспортируется в client.ts.
 */
export const AGENT_NAME_MAX_LENGTH = 60;
export const AGENT_DESCRIPTION_MAX_LENGTH = 500;
/** Сколько включённых агентов может быть в пространстве. */
export const AGENTS_PER_WORKSPACE_LIMIT = 20;

/** User.image агента: тот же эндпоинт фото, для агента он отдаёт робота (модуль profiles). */
export function agentAvatarUrl(agentId: string): string {
  return `/api/users/${agentId}/avatar`;
}
