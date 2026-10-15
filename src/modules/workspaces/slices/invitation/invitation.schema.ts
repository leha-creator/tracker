import { z } from 'zod';

import { workspaceRoleField } from '../member/member.schema';

export const inviteMemberSchema = z.object({
  workspaceId: z.string({ error: 'Не указано пространство' }).min(1),
  email: z
    .string({ error: 'Укажите email' })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Некорректный email' }).max(254, { error: 'Слишком длинный email' })),
  role: workspaceRoleField.default('member'),
});

export const cancelInvitationSchema = z.object({
  workspaceId: z.string({ error: 'Не указано пространство' }).min(1),
  invitationId: z.string({ error: 'Не указано приглашение' }).min(1),
});

export const respondInvitationSchema = z.object({
  invitationId: z.string({ error: 'Не указано приглашение' }).min(1),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
