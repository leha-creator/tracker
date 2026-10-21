// Публичный API модуля для серверного кода (страницы, Route Handlers).
// Клиентским компонентам — './client' (без server-only кода).
// Связка с meet (docs/meet.md): старт созвона по задаче, вебхуки meet, конспект в документы.
// Зависимости: integrations/meet → tasks, documents, workspaces, notifications (через их index.ts).
export * from './client';

export { isMeetEnabled } from './meet-config';
export { isMeetWebhookEvent } from './models';
export type { MeetWebhookEvent } from './models';
export { createSubtasksFromActionItems } from './slices/action-items/action-items.service';
export { listTaskMeetings } from './slices/meeting/meeting.service';
export { startTaskMeeting } from './slices/start/start.service';
export { handleMeetWebhook, verifyMeetWebhookSignature } from './slices/webhook/webhook.service';
export type { MeetWebhookResult } from './slices/webhook/webhook.service';
