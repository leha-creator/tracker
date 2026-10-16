import { describe, expect, it } from 'vitest';

import { routeAgentRecipients, type AgentRoute } from './agent-routing';
import type { NotificationEvent } from './notification-recipients';

const payload = {
  workspaceSlug: 'team',
  workspaceName: 'Команда',
  actorName: 'Борис',
  taskNumber: 7,
  taskTitle: 'Задача',
  commentExcerpt: 'Привет',
};

function event(recipientId: string, actorId = 'boris'): NotificationEvent {
  return {
    type: 'mention',
    recipientId,
    workspaceId: 'ws-1',
    actorId,
    taskId: 't-1',
    commentId: 'c-1',
    payload,
  };
}

function route(overrides: Partial<AgentRoute> = {}): AgentRoute {
  return {
    agentId: 'agent-1',
    name: 'Claude — backend',
    workspaceId: 'ws-1',
    responsibleUserId: 'anna',
    ownerIds: ['owner-1', 'owner-2'],
    ...overrides,
  };
}

describe('routeAgentRecipients', () => {
  it('sends an agent notification to the responsible with forAgent', () => {
    const { events, rerouted } = routeAgentRecipients(
      [event('agent-1'), event('vera')],
      new Map([['agent-1', route()]]),
    );
    expect(events.map((item) => item.recipientId)).toEqual(['anna', 'vera']);
    expect(events[0]!.payload).toMatchObject({ forAgent: { name: 'Claude — backend' } });
    expect(events[1]!.payload).not.toHaveProperty('forAgent');
    expect(rerouted).toEqual([{ agentId: 'agent-1', type: 'mention', to: ['anna'] }]);
  });

  it('falls back to the owners when the responsible left the workspace', () => {
    const { events } = routeAgentRecipients(
      [event('agent-1')],
      new Map([['agent-1', route({ responsibleUserId: null })]]),
    );
    expect(events.map((item) => item.recipientId)).toEqual(['owner-1', 'owner-2']);
  });

  it('does not notify the responsible about their own action', () => {
    const { events } = routeAgentRecipients(
      [event('agent-1', 'anna')],
      new Map([['agent-1', route()]]),
    );
    expect(events).toEqual([]);
  });

  it('does not notify about the agent acting itself', () => {
    const { events, rerouted } = routeAgentRecipients(
      [event('agent-1', 'agent-1')],
      new Map([['agent-1', route()]]),
    );
    expect(events).toEqual([]);
    expect(rerouted).toEqual([]);
  });

  it('handles several agents in one action', () => {
    const { events } = routeAgentRecipients(
      [event('agent-1'), event('agent-2')],
      new Map([
        ['agent-1', route()],
        ['agent-2', route({ agentId: 'agent-2', name: 'Claude — web', responsibleUserId: 'vera' })],
      ]),
    );
    expect(events.map((item) => [item.recipientId, item.payload.forAgent?.name])).toEqual([
      ['anna', 'Claude — backend'],
      ['vera', 'Claude — web'],
    ]);
  });
});
