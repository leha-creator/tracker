import { z } from 'zod';

import { WORKSPACE_ROLES } from '@/shared/access/workspace-role';

const workspaceIdField = z.string({ error: 'Не указано пространство' }).min(1);
const memberIdField = z.string({ error: 'Не указан участник' }).min(1);

export const workspaceRoleField = z.enum(WORKSPACE_ROLES, { error: 'Недопустимая роль' });

export const changeMemberRoleSchema = z.object({
  workspaceId: workspaceIdField,
  memberId: memberIdField,
  role: workspaceRoleField,
});

export const removeMemberSchema = z.object({
  workspaceId: workspaceIdField,
  memberId: memberIdField,
});

export const leaveWorkspaceSchema = z.object({ workspaceId: workspaceIdField });

export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>;
