'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { formValues, type FormState } from '@/shared/types';

import type { AgentDto } from './agent.dto';
import { agentRefSchema, createAgentSchema, updateAgentSchema } from './agent.schema';
import { createAgent, disableAgent, enableAgent, updateAgent } from './agent.service';

const FORM_KEYS = [
  'name',
  'description',
  'responsibleUserId',
  'canManageProjects',
  'canManageDocuments',
] as const;

export async function createAgentAction(
  _prev: FormState<AgentDto>,
  formData: FormData,
): Promise<FormState<AgentDto>> {
  try {
    const input = createAgentSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    const data = await createAgent(session, input);
    revalidatePath('/', 'layout');
    return { ok: true, data };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'createAgent' }),
      values: formValues(formData, FORM_KEYS),
    };
  }
}

export async function updateAgentAction(
  _prev: FormState<AgentDto>,
  formData: FormData,
): Promise<FormState<AgentDto>> {
  try {
    const input = updateAgentSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    const data = await updateAgent(session, input);
    revalidatePath('/', 'layout');
    return { ok: true, data };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'updateAgent' }),
      values: formValues(formData, FORM_KEYS),
    };
  }
}

export async function disableAgentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = agentRefSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await disableAgent(session, input);
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'disableAgent' }), values: {} };
  }
}

export async function enableAgentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = agentRefSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await enableAgent(session, input);
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'enableAgent' }), values: {} };
  }
}
