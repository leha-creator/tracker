'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { formValues, type FormState } from '../../workspaces.form-state';
import type { InviteMemberResult } from './invitation.dto';
import {
  cancelInvitationSchema,
  inviteMemberSchema,
  respondInvitationSchema,
} from './invitation.schema';
import {
  acceptInvitation,
  cancelInvitation,
  inviteMember,
  rejectInvitation,
} from './invitation.service';

const log = createLogger('workspaces.actions');

export async function inviteMemberAction(
  _prev: FormState<InviteMemberResult>,
  formData: FormData,
): Promise<FormState<InviteMemberResult>> {
  try {
    const input = inviteMemberSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    const result = await inviteMember(session, input);
    revalidatePath('/', 'layout');
    return { ok: true, data: result };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'inviteMember' }),
      values: formValues(formData, ['email', 'role']),
    };
  }
}

export async function cancelInvitationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const input = cancelInvitationSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await cancelInvitation(session, input);
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'cancelInvitation' }), values: {} };
  }
}

export async function acceptInvitationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let workspaceSlug: string;
  try {
    const input = respondInvitationSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    ({ workspaceSlug } = await acceptInvitation(session, input));
  } catch (error) {
    return { ...toActionError(error, { action: 'acceptInvitation' }), values: {} };
  }
  revalidatePath('/', 'layout');
  log.debug({ to: `/w/${workspaceSlug}` }, '[workspaces.actions.acceptInvitation] redirect');
  redirect(`/w/${workspaceSlug}`);
}

export async function rejectInvitationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const input = respondInvitationSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await rejectInvitation(session, input);
  } catch (error) {
    return { ...toActionError(error, { action: 'rejectInvitation' }), values: {} };
  }
  revalidatePath('/', 'layout');
  log.debug({ to: '/' }, '[workspaces.actions.rejectInvitation] redirect');
  redirect('/');
}
