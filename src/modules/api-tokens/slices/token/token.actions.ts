'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { formValues, type FormState } from '@/shared/types';

import type { CreatedApiTokenDto } from './token.dto';
import {
  createAgentTokenSchema,
  createApiTokenSchema,
  revokeAgentTokenSchema,
  revokeApiTokenSchema,
  tokenFormInput,
} from './token.schema';
import {
  createAgentToken,
  createApiToken,
  revokeAgentToken,
  revokeApiToken,
} from './token.service';

export async function createApiTokenAction(
  _prev: FormState<CreatedApiTokenDto>,
  formData: FormData,
): Promise<FormState<CreatedApiTokenDto>> {
  try {
    const input = createApiTokenSchema.parse(tokenFormInput(formData));
    const session = await requireUser();
    const data = await createApiToken(session, input);
    revalidatePath('/profile', 'layout');
    return { ok: true, data };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'createApiToken' }),
      values: formValues(formData, ['name', 'workspaceId', 'expiry']),
    };
  }
}

export async function revokeApiTokenAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const { tokenId } = revokeApiTokenSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await revokeApiToken(session, tokenId);
    revalidatePath('/profile', 'layout');
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'revokeApiToken' }), values: {} };
  }
}

/** Токен агента: выпускает владелец пространства на странице агента. */
export async function createAgentTokenAction(
  _prev: FormState<CreatedApiTokenDto>,
  formData: FormData,
): Promise<FormState<CreatedApiTokenDto>> {
  try {
    const input = createAgentTokenSchema.parse(tokenFormInput(formData));
    const session = await requireUser();
    const data = await createAgentToken(session, input);
    revalidatePath('/w/[workspaceSlug]/settings/agents', 'layout');
    return { ok: true, data };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'createAgentToken' }),
      values: formValues(formData, ['name', 'expiry']),
    };
  }
}

export async function revokeAgentTokenAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const input = revokeAgentTokenSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await revokeAgentToken(session, input);
    revalidatePath('/w/[workspaceSlug]/settings/agents', 'layout');
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'revokeAgentToken' }), values: {} };
  }
}
