/**
 * Служебная почта агента пространства. Домен `.invalid` (RFC 2606) заведомо недоставляем:
 * Better Auth требует уникальный email, а письма на него не уйдут (sendMail их пропускает).
 * Чистый TS: используется модулями agents (создание) и workspaces (запрет приглашения).
 */
export const AGENT_EMAIL_DOMAIN = 'agents.tasker.invalid';

export function agentEmail(agentId: string): string {
  return `agent-${agentId}@${AGENT_EMAIL_DOMAIN}`;
}

export function isAgentEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${AGENT_EMAIL_DOMAIN}`);
}
