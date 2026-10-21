import 'server-only';

import { createSystemTaskNote } from '@/modules/documents';
import { notify, type NotificationEvent } from '@/modules/notifications';
import { emitTaskEvent, formatTaskKey, listWatcherIds } from '@/modules/tasks';
import { isWorkspaceMember } from '@/modules/workspaces';
import { recordAuditEvent } from '@/shared/audit';
import { env } from '@/shared/env';
import { findUsersByIdpSubjects } from '@/shared/idp';
import { createLogger } from '@/shared/logger';

import { getMeetConfig } from '../../meet-config';
import {
  renderMeetingSummaryNote,
  toStoredActionItems,
  verifyTaskContext,
  type MeetingCreatedEvent,
  type MeetingEndedEvent,
  type RecapReadyEvent,
} from '../../models';
import { meetingRepository, type MeetingTaskRow } from '../meeting/meeting.repository';
import type { MeetWebhookContext, MeetWebhookOutcome } from './webhook.types';

const log = createLogger('integrations:meet');

/** Задача доступна для изменений: есть, не в архиве, пространство не в архиве. */
function isTaskActive(task: MeetingTaskRow | null): task is MeetingTaskRow {
  return task !== null && task.archivedAt === null && task.workspace.archivedAt === null;
}

function taskSnapshot(task: MeetingTaskRow) {
  return {
    taskKey: formatTaskKey(task.number, task.workspace.taskKey),
    taskNumber: task.number,
    title: task.title,
  };
}

/**
 * meeting.created: встреча, созданная по контексту задачи. Задача и пространство — только из
 * `ctx`, подписанного tasker; организатор должен совпасть с тем, кто нажал «Начать созвон», и
 * оставаться участником пространства.
 */
export async function handleMeetingCreated(
  event: MeetingCreatedEvent,
  ctx: MeetWebhookContext,
): Promise<MeetWebhookOutcome> {
  const config = getMeetConfig();
  if (!config) return 'ignored';
  const logContext = { deliveryId: ctx.deliveryId, meetingId: event.meetingId };

  const verified = verifyTaskContext(event.ctx, config.contextSecret, {
    now: Math.floor(Date.now() / 1000),
    mode: 'webhook',
  });
  if (!verified.ok) {
    log.warn({ ...logContext, reason: verified.error }, '[meet.webhook] meeting.created: bad ctx');
    return 'ignored';
  }
  const context = verified.context;
  if (context.sub !== event.hostSub) {
    log.warn(
      { ...logContext, jti: context.jti },
      '[meet.webhook] meeting.created: host is not the user who started the call',
    );
    return 'ignored';
  }

  const host = (await findUsersByIdpSubjects([event.hostSub])).get(event.hostSub);
  log.debug({ ...logContext, hostUserId: host?.id ?? null }, '[meet.webhook] host resolved');
  if (!host || !(await isWorkspaceMember(context.workspaceId, host.id))) {
    log.warn(
      { ...logContext, workspaceId: context.workspaceId, hostUserId: host?.id ?? null },
      '[meet.webhook] meeting.created: host has no access to the workspace',
    );
    return 'ignored';
  }

  const task = await meetingRepository.findTask(context.workspaceId, context.taskId, ctx.tx);
  if (!isTaskActive(task)) {
    log.warn(
      { ...logContext, workspaceId: context.workspaceId, taskId: context.taskId },
      '[meet.webhook] meeting.created: task missing or archived',
    );
    return 'ignored';
  }

  const meeting = await meetingRepository.upsertMeeting(ctx.tx, {
    workspaceId: context.workspaceId,
    taskId: context.taskId,
    meetMeetingId: event.meetingId,
    code: event.code,
    url: event.url,
    hostUserId: host.id,
    contextJti: context.jti,
    startedAt: new Date(event.createdAt),
  });
  if (!meeting.created) {
    log.debug({ ...logContext, jti: context.jti }, '[meet.webhook] meeting already linked');
    return 'ignored';
  }
  log.info(
    { ...logContext, workspaceId: context.workspaceId, taskId: task.id, taskMeetingId: meeting.id },
    '[meet.webhook] meeting linked to task',
  );

  ctx.afterCommit('audit', () =>
    recordAuditEvent({
      kind: 'meeting.started',
      actor: { actorId: host.id, actorName: host.name },
      workspaceId: context.workspaceId,
      data: { ...taskSnapshot(task), meetingCode: event.code },
    }),
  );
  ctx.afterCommit('realtime', () =>
    emitTaskEvent(null, {
      workspaceId: context.workspaceId,
      kind: 'task.updated',
      taskId: task.id,
      taskNumber: task.number,
    }),
  );
  return 'handled';
}

/** meeting.ended: отметка конца встречи; чужая или неизвестная встреча — ignored. */
export async function handleMeetingEnded(
  event: MeetingEndedEvent,
  ctx: MeetWebhookContext,
): Promise<MeetWebhookOutcome> {
  const meeting = await meetingRepository.findByMeetId(event.meetingId, ctx.tx);
  if (!meeting) {
    log.debug({ meetingId: event.meetingId }, '[meet.webhook] meeting.ended: unknown meeting');
    return 'ignored';
  }
  const updated = await meetingRepository.markEnded(
    ctx.tx,
    event.meetingId,
    new Date(event.endedAt),
  );
  if (updated === 0) return 'ignored';
  log.info(
    { meetingId: event.meetingId, workspaceId: meeting.workspaceId, taskId: meeting.taskId },
    '[meet.webhook] meeting ended',
  );
  ctx.afterCommit('realtime', () =>
    emitTaskEvent(null, {
      workspaceId: meeting.workspaceId,
      kind: 'task.updated',
      taskId: meeting.taskId,
    }),
  );
  return 'handled';
}

/**
 * recap.ready: заметка с конспектом в документах задачи от имени организатора и поручения для
 * подзадач. Организатор потерял доступ или задача в архиве — конспект не сохраняется.
 */
export async function handleRecapReady(
  event: RecapReadyEvent,
  ctx: MeetWebhookContext,
): Promise<MeetWebhookOutcome> {
  const logContext = {
    deliveryId: ctx.deliveryId,
    meetingId: event.meetingId,
    recapId: event.recapId,
  };
  const meeting = await meetingRepository.findByMeetId(event.meetingId, ctx.tx);
  if (!meeting) {
    log.warn(logContext, '[meet.webhook] recap.ready: unknown meeting');
    return 'ignored';
  }
  if (await meetingRepository.findRecapByMeetId(ctx.tx, event.recapId)) {
    log.debug(logContext, '[meet.webhook] recap.ready: already saved');
    return 'ignored';
  }

  const { workspaceId, taskId, hostUserId } = meeting;
  const task = await meetingRepository.findTask(workspaceId, taskId, ctx.tx);
  if (!isTaskActive(task)) {
    log.warn({ ...logContext, workspaceId, taskId }, '[meet.webhook] recap.ready: task archived');
    return 'ignored';
  }
  if (!hostUserId || !(await isWorkspaceMember(workspaceId, hostUserId))) {
    log.warn(
      { ...logContext, workspaceId, hostUserId },
      '[meet.webhook] recap.ready: host has no access to the workspace',
    );
    return 'ignored';
  }

  const taskKey = formatTaskKey(task.number, task.workspace.taskKey);
  const actionItems = toStoredActionItems(event.summary);
  const note = renderMeetingSummaryNote({
    summary: event.summary,
    actionItems,
    taskKey,
    meetingUrl: meeting.url,
    completedAt: new Date(event.completedAt),
    timeZone: env.REMINDERS_TIMEZONE,
  });
  const document = await createSystemTaskNote(ctx.tx, {
    workspaceId,
    taskId,
    createdById: hostUserId,
    title: note.title,
    content: note.content,
  });
  const recap = await meetingRepository.createRecap(ctx.tx, {
    meetingId: meeting.id,
    meetRecapId: event.recapId,
    documentId: document.documentId,
    actionItems,
    completedAt: new Date(event.completedAt),
  });
  log.info(
    {
      ...logContext,
      workspaceId,
      taskId,
      documentId: document.documentId,
      taskMeetingRecapId: recap.id,
      actionItems: actionItems.length,
    },
    '[meet.webhook] summary saved',
  );

  const actor = { actorId: hostUserId };
  ctx.afterCommit('audit', async () => {
    await recordAuditEvent({
      kind: 'document.created',
      actor,
      workspaceId,
      data: { documentId: document.documentId, title: document.title, kind: 'note' },
    });
    await recordAuditEvent({
      kind: 'meeting.summary_added',
      actor,
      workspaceId,
      data: {
        ...taskSnapshot(task),
        documentId: document.documentId,
        documentTitle: document.title,
      },
    });
  });
  ctx.afterCommit('notify', async () => {
    const watcherIds = await listWatcherIds(workspaceId, taskId);
    const recipients = [hostUserId, task.assigneeId, ...watcherIds].filter(
      (id): id is string => id !== null,
    );
    const payload = {
      workspaceSlug: task.workspace.slug,
      workspaceName: task.workspace.name,
      actorName: null,
      taskNumber: task.number,
      taskTitle: task.title,
      taskKey,
      documentId: document.documentId,
      documentTitle: document.title,
    };
    const events: NotificationEvent[] = recipients.map((recipientId) => ({
      type: 'meeting_summary_ready',
      recipientId,
      workspaceId,
      // Системное событие: организатор тоже получает уведомление.
      actorId: null,
      taskId,
      payload,
    }));
    log.debug({ recapId: event.recapId, recipients: events.length }, '[meet.webhook] notify');
    await notify(events);
  });
  ctx.afterCommit('realtime', () =>
    emitTaskEvent(null, { workspaceId, kind: 'task.updated', taskId, taskNumber: task.number }),
  );
  return 'handled';
}
