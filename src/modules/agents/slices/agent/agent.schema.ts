import { z } from 'zod';

import { AGENT_DESCRIPTION_MAX_LENGTH, AGENT_NAME_MAX_LENGTH } from '../../models/agent';

const workspaceIdField = z.string({ error: 'Не указано пространство' }).min(1);
const agentIdField = z.string({ error: 'Не указан агент' }).min(1);

/** Неотмеченный чекбокс в форму не попадает — по умолчанию false. */
const flagField = z.stringbool({ error: 'Недопустимое значение' }).default(false);

const agentFields = {
  workspaceId: workspaceIdField,
  name: z
    .string({ error: 'Укажите название' })
    .trim()
    .min(1, { error: 'Укажите название' })
    .max(AGENT_NAME_MAX_LENGTH, { error: `Название не длиннее ${AGENT_NAME_MAX_LENGTH} символов` }),
  description: z
    .string()
    .trim()
    .max(AGENT_DESCRIPTION_MAX_LENGTH, {
      error: `Описание не длиннее ${AGENT_DESCRIPTION_MAX_LENGTH} символов`,
    })
    .optional()
    .transform((value) => (value ? value : null)),
  responsibleUserId: z
    .string({ error: 'Выберите ответственного' })
    .min(1, { error: 'Выберите ответственного' }),
  canManageProjects: flagField,
  canManageDocuments: flagField,
};

export const createAgentSchema = z.object(agentFields);
export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export const updateAgentSchema = z.object({ ...agentFields, agentId: agentIdField });
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;

export const agentRefSchema = z.object({ workspaceId: workspaceIdField, agentId: agentIdField });
export type AgentRefInput = z.infer<typeof agentRefSchema>;
