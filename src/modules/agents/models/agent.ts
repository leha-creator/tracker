/**
 * Агент пространства — служебный пользователь (User.isAgent) с членством в одном пространстве.
 * Чистый TS без зависимостей: файл экспортируется в client.ts.
 */
export const AGENT_NAME_MAX_LENGTH = 60;
export const AGENT_DESCRIPTION_MAX_LENGTH = 500;
/** Сколько включённых агентов может быть в пространстве. */
export const AGENTS_PER_WORKSPACE_LIMIT = 20;

/** User.image агента: статичный робот (public/agent-avatar.svg), его пропускает isAvatarUrl. */
export const AGENT_AVATAR_PATH = '/agent-avatar.svg';
