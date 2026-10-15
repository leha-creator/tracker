import { z } from 'zod';

import { WORKSPACE_PERMISSIONS, WORKSPACE_ROLES } from '@/shared/access/workspace-role';

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

export const setMemberPermissionSchema = z.object({
  workspaceId: workspaceIdField,
  memberId: memberIdField,
  permission: z.enum(WORKSPACE_PERMISSIONS, { error: 'Недопустимое право' }),
  value: z.stringbool({ error: 'Недопустимое значение' }),
});

export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>;
