'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { formValues, type FormState } from '@/shared/types';

import type { CreatedApiTokenDto } from './token.dto';
import { createApiTokenSchema, revokeApiTokenSchema } from './token.schema';
import { createApiToken, revokeApiToken } from './token.service';

export async function createApiTokenAction(
  _prev: FormState<CreatedApiTokenDto>,
  formData: FormData,
): Promise<FormState<CreatedApiTokenDto>> {
  try {
    const input = createApiTokenSchema.parse(Object.fromEntries(formData));
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
