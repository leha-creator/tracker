/**
 * Области токена: что агенту разрешено менять через MCP. `read` есть у любого токена.
 * Чистый TS: используется формами выпуска (client.ts) и проверкой инструментов в agent-mcp.
 */
export const API_TOKEN_SCOPES = ['read', 'tasks', 'documents'] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

export const API_TOKEN_SCOPE_LABELS: Record<ApiTokenScope, string> = {
  read: 'Чтение',
  tasks: 'Задачи',
  documents: 'Документы',
};

export const API_TOKEN_SCOPE_DESCRIPTIONS: Record<ApiTokenScope, string> = {
  read: 'Задачи, проекты, документы и участники — только чтение. Есть всегда.',
  tasks: 'Создание и изменение задач, статусов, комментариев и вложений.',
  documents: 'Создание и изменение документов: заметки, файлы, папки, теги, связи с задачами.',
};

function isScope(value: string): value is ApiTokenScope {
  return (API_TOKEN_SCOPES as readonly string[]).includes(value);
}

/**
 * Области в каноническом порядке: `read` добавляется всегда, неизвестные значения (например,
 * из старых записей) и повторы отбрасываются.
 */
export function normalizeScopes(values: readonly string[]): ApiTokenScope[] {
  const set = new Set<ApiTokenScope>(['read']);
  for (const value of values) if (isScope(value)) set.add(value);
  return API_TOKEN_SCOPES.filter((scope) => set.has(scope));
}

export function hasScope(scopes: readonly string[], scope: ApiTokenScope): boolean {
  return scope === 'read' || scopes.includes(scope);
}
