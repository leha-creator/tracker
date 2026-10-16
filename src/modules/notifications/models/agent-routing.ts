import type { NotificationEvent } from './notification-recipients';

/**
 * Куда направлять уведомления включённого агента пространства. Агент — служебный участник
 * (модуль agents): сам их не читает, поэтому получает его ответственный, а если ответственного
 * нет или он вышел из пространства — владельцы пространства.
 */
export interface AgentRoute {
  agentId: string;
  name: string;
  workspaceId: string;
  /** Ответственный, если он ещё участник пространства; иначе null. */
  responsibleUserId: string | null;
  /** Владельцы пространства (люди) — запасные получатели. */
  ownerIds: readonly string[];
}

export interface AgentReroute {
  agentId: string;
  type: NotificationEvent['type'];
  to: string[];
}

/**
 * Заменяет получателей-агентов людьми и добавляет в payload `forAgent`. Автор действия
 * исключается до перенаправления (агент не уведомляет ответственного о своих же действиях)
 * и после (ответственный не получает уведомление о своём действии).
 */
export function routeAgentRecipients(
  events: readonly NotificationEvent[],
  routes: ReadonlyMap<string, AgentRoute>,
): { events: NotificationEvent[]; rerouted: AgentReroute[] } {
  const result: NotificationEvent[] = [];
  const rerouted: AgentReroute[] = [];
  for (const event of events) {
    if (event.actorId !== null && event.recipientId === event.actorId) continue;
    const route = routes.get(event.recipientId);
    if (!route || route.workspaceId !== event.workspaceId) {
      result.push(event);
      continue;
    }
    const targets = (route.responsibleUserId ? [route.responsibleUserId] : route.ownerIds).filter(
      (userId) => userId !== event.actorId,
    );
    for (const userId of targets) {
      result.push({
        ...event,
        recipientId: userId,
        payload: { ...event.payload, forAgent: { name: route.name } },
      } as NotificationEvent);
    }
    rerouted.push({ agentId: route.agentId, type: event.type, to: targets });
  }
  return { events: result, rerouted };
}
