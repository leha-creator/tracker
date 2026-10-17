import { describe, expect, it } from 'vitest';

import {
  createRealtimeEvent,
  encodeRealtimeEvent,
  matchesRealtimeFilter,
  parseRealtimeEvent,
  REALTIME_PAYLOAD_LIMIT_BYTES,
  type RealtimeEvent,
} from './realtime-event';

const event = (patch: Partial<RealtimeEvent> = {}): RealtimeEvent => ({
  ...createRealtimeEvent({
    workspaceId: 'ws-1',
    kind: 'task.updated',
    taskId: 'task-1',
    taskNumber: 42,
    projectIds: ['p-1'],
    actorId: 'u-1',
    at: 1000,
  }),
  ...patch,
});

describe('encodeRealtimeEvent / parseRealtimeEvent', () => {
  it('round-trips an event', () => {
    expect(parseRealtimeEvent(encodeRealtimeEvent(event()))).toEqual(event());
  });

  it('drops project ids and marks truncated when the payload is too large', () => {
    const projectIds = Array.from({ length: 400 }, (_, index) => `project-${index}-xxxxxxxxxx`);
    const encoded = encodeRealtimeEvent(event({ projectIds }));
    expect(new TextEncoder().encode(encoded).length).toBeLessThanOrEqual(
      REALTIME_PAYLOAD_LIMIT_BYTES,
    );
    expect(parseRealtimeEvent(encoded)).toMatchObject({ projectIds: [], truncated: true });
  });

  it('returns null for garbage', () => {
    expect(parseRealtimeEvent('not json')).toBeNull();
    expect(parseRealtimeEvent('{"v":2}')).toBeNull();
    expect(parseRealtimeEvent(JSON.stringify({ ...event(), kind: 'task.deleted' }))).toBeNull();
  });
});

describe('matchesRealtimeFilter', () => {
  it('matches by project', () => {
    expect(matchesRealtimeFilter(event(), { projectId: 'p-1' })).toBe(true);
    expect(matchesRealtimeFilter(event(), { projectId: 'p-2' })).toBe(false);
  });

  it('matches by task regardless of project', () => {
    expect(matchesRealtimeFilter(event(), { taskId: 'task-1' })).toBe(true);
    expect(matchesRealtimeFilter(event(), { taskId: 'task-2' })).toBe(false);
    expect(matchesRealtimeFilter(event(), { taskId: 'task-1', projectId: 'p-2' })).toBe(true);
  });

  it('lets resync and truncated events through', () => {
    expect(matchesRealtimeFilter(event({ kind: 'resync' }), { projectId: 'p-9' })).toBe(true);
    expect(matchesRealtimeFilter(event({ kind: 'resync' }), { taskId: 'x' })).toBe(true);
    expect(
      matchesRealtimeFilter(event({ projectIds: [], truncated: true }), { projectId: 'p-9' }),
    ).toBe(true);
  });

  it('skips comment events for task-only subscribers', () => {
    const comment = event({ kind: 'comment.changed' });
    expect(matchesRealtimeFilter(comment, { tasksOnly: true })).toBe(false);
    expect(matchesRealtimeFilter(comment, { taskId: 'task-1' })).toBe(true);
    expect(matchesRealtimeFilter(event(), { tasksOnly: true })).toBe(true);
  });

  it('matches everything with an empty filter', () => {
    expect(matchesRealtimeFilter(event({ kind: 'comment.changed' }), {})).toBe(true);
  });
});
