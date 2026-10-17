/**
 * Области токена для инструментов MCP. Совпадают с API_TOKEN_SCOPES модуля api-tokens (строки,
 * чтобы модель не зависела от другого модуля). Чистый TS.
 */
export type McpScope = 'read' | 'tasks' | 'documents';

/** Инструмент → область, которая нужна для его вызова. Новый инструмент без записи не скомпилируется. */
export const TOOL_SCOPES = {
  get_workspace_context: 'read',
  list_tasks: 'read',
  get_task: 'read',
  get_task_history: 'read',
  get_github_conventions: 'read',
  preview_github_links: 'read',
  get_attachment_url: 'read',
  list_documents: 'read',
  list_document_folders: 'read',
  list_document_tags: 'read',
  get_document: 'read',

  create_task: 'tasks',
  update_task: 'tasks',
  set_task_status: 'tasks',
  set_task_parent: 'tasks',
  archive_task: 'tasks',
  restore_task: 'tasks',
  add_comment: 'tasks',
  request_attachment_upload: 'tasks',
  complete_attachment_upload: 'tasks',

  create_note: 'documents',
  update_note: 'documents',
  create_document_folder: 'documents',
  set_document_tags: 'documents',
  link_document_to_task: 'documents',
  unlink_document_from_task: 'documents',
  request_document_upload: 'documents',
  complete_document_upload: 'documents',
} as const satisfies Record<string, McpScope>;

export type McpToolName = keyof typeof TOOL_SCOPES;

/** Промпты start_task / finish_task меняют задачи — нужна область tasks. */
export const PROMPTS_SCOPE: McpScope = 'tasks';

const SCOPE_TITLES: Record<McpScope, string> = {
  read: 'чтение',
  tasks: 'изменение задач',
  documents: 'изменение документов',
};

export function hasMcpScope(scopes: readonly string[], scope: McpScope): boolean {
  return scope === 'read' || scopes.includes(scope);
}

/** Есть ли у токена область инструмента. Неизвестный инструмент — нет (безопасный дефолт). */
export function isToolAllowed(tool: string, scopes: readonly string[]): boolean {
  const scope = (TOOL_SCOPES as Record<string, McpScope | undefined>)[tool];
  return scope !== undefined && hasMcpScope(scopes, scope);
}

/** Текст отказа для агента: какой области не хватает. */
export function scopeDeniedMessage(tool: string): string {
  const scope = (TOOL_SCOPES as Record<string, McpScope | undefined>)[tool] ?? 'tasks';
  return `Токен не даёт права «${SCOPE_TITLES[scope]}» (область ${scope}), нужное для ${tool}. Попросите пользователя выпустить токен с этой областью.`;
}

/** От чьего имени действует агент — для инструкций сервера и get_workspace_context. */
export interface McpActor {
  name: string;
  userId: string;
  tokenName: string;
  scopes: readonly string[];
  agent: { responsibleName: string | null } | null;
}

export function describeActor(actor: McpActor): string {
  const scopes = `Token scopes: ${actor.scopes.join(', ')}.`;
  const who = actor.agent
    ? `You act as agent "${actor.name}" (responsible: ${actor.agent.responsibleName ?? 'not assigned'}); tasks, comments and documents you create are signed by the agent.`
    : `You act as ${actor.name} via personal token "${actor.tokenName}"; what you create is marked "via agent".`;
  const limits: string[] = [];
  if (!hasMcpScope(actor.scopes, 'tasks')) {
    limits.push('You cannot change tasks, comments or attachments — only read them.');
  }
  if (!hasMcpScope(actor.scopes, 'documents')) {
    limits.push('You cannot change documents — only read them.');
  }
  return [who, scopes, ...limits].join(' ');
}
