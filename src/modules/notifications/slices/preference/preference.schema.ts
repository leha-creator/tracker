import { z } from 'zod';

import { NOTIFICATION_CHANNELS, NOTIFICATION_TYPES } from '../../models';

export const updateNotificationPreferenceSchema = z.object({
  type: z.enum(NOTIFICATION_TYPES, { error: 'Неизвестный тип уведомления' }),
  channel: z.enum(NOTIFICATION_CHANNELS, { error: 'Неизвестный канал' }),
  enabled: z.boolean(),
});

export type UpdateNotificationPreferenceInput = z.infer<typeof updateNotificationPreferenceSchema>;
