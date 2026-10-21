import { z } from 'zod';

// События meet → tasker (docs/meet.md). Лимиты — с запасом к RecapSummary meet: строки до 2000
// символов, массивы до 50 элементов. Лишние поля игнорируются (meet может добавить новые).

export const MEET_WEBHOOK_EVENTS = ['meeting.created', 'meeting.ended', 'recap.ready'] as const;
export type MeetWebhookEvent = (typeof MEET_WEBHOOK_EVENTS)[number];

export function isMeetWebhookEvent(value: string): value is MeetWebhookEvent {
  return (MEET_WEBHOOK_EVENTS as readonly string[]).includes(value);
}

const id = z.string().min(1).max(64);
const text = z.string().max(2000);
const list = z.array(text).max(50);

export const meetingCreatedSchema = z.object({
  meetingId: id,
  code: z.string().regex(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/),
  url: z.url({ protocol: /^https?$/ }).max(500),
  hostSub: z.string().min(1).max(255),
  createdAt: z.iso.datetime({ offset: true }),
  ctx: z.string().min(1).max(4000),
});

export const meetingEndedSchema = z.object({
  meetingId: id,
  endedAt: z.iso.datetime({ offset: true }),
});

export const actionItemSchema = z.object({
  owner: z.string().max(200).default(''),
  task: z.string().min(1).max(2000),
  due: z.string().max(40).nullish(),
});

export const recapSummarySchema = z.object({
  overview: text.default(''),
  topics: list.default([]),
  decisions: list.default([]),
  actionItems: z.array(actionItemSchema).max(50).default([]),
  openQuestions: list.default([]),
});

export const recapReadySchema = z.object({
  meetingId: id,
  recapId: id,
  completedAt: z.iso.datetime({ offset: true }),
  summary: recapSummarySchema,
});

export type MeetingCreatedEvent = z.infer<typeof meetingCreatedSchema>;
export type MeetingEndedEvent = z.infer<typeof meetingEndedSchema>;
export type RecapReadyEvent = z.infer<typeof recapReadySchema>;
export type RecapSummary = z.infer<typeof recapSummarySchema>;
