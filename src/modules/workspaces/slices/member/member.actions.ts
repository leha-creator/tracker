'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import type { FormState } from '../../workspaces.form-state';
import { changeMemberRoleSchema, leaveWorkspaceSchema, removeMemberSchema } from './member.schema';
import { changeMemberRole, leaveWorkspace, removeMember } from './member.service';

const log = createLogger('workspaces.actions');

export async function changeMemberRoleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const input = changeMemberRoleSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await changeMemberRole(session, input);
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'changeMemberRole' }), values: {} };
  }
}

export async function removeMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = removeMemberSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await removeMember(session, input);
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'removeMember' }), values: {} };
  }
}

export async function leaveWorkspaceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const input = leaveWorkspaceSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await leaveWorkspace(session, input);
  } catch (error) {
    return { ...toActionError(error, { action: 'leaveWorkspace' }), values: {} };
  }
  revalidatePath('/', 'layout');
  log.debug({ to: '/' }, '[workspaces.actions.leave] redirect');
  redirect('/');
}
