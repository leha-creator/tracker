/**
 * Публичный API модуля для клиентских компонентов: Server Actions, схемы, константы и типы.
 * Без server-only кода (сервисов, репозиториев) — их экспортирует только index.ts.
 */
export {
  AGENT_DESCRIPTION_MAX_LENGTH,
  AGENT_NAME_MAX_LENGTH,
  AGENTS_PER_WORKSPACE_LIMIT,
} from './models/agent';
export {
  createAgentAction,
  disableAgentAction,
  enableAgentAction,
  updateAgentAction,
} from './slices/agent/agent.actions';
export type { AgentDto } from './slices/agent/agent.dto';
