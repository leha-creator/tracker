'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { ok, toActionError } from '@/shared/errors';
import { type FormState } from '@/shared/types';

import { revokeMyOtherSessions, revokeMySession } from './session.service';
import { signOut } from './sign-out.service';

const SECURITY_PATH = '/profile/security';

const revokeSessionSchema = z.object({
  sessionId: z.string({ error: 'Сессия не найдена' }).min(1).max(64),
});

export async function revokeSessionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const { sessionId } = revokeSessionSchema.parse(Object.fromEntries(formData));
    await revokeMySession(sessionId);
  } catch (error) {
    return { ...toActionError(error, { action: 'revokeSession' }), values: {} };
  }
  revalidatePath(SECURITY_PATH);
  return ok(null);
}

export async function revokeOtherSessionsAction(): Promise<FormState> {
  try {
    await revokeMyOtherSessions();
  } catch (error) {
    return { ...toActionError(error, { action: 'revokeOtherSessions' }), values: {} };
  }
  revalidatePath(SECURITY_PATH);
  return ok(null);
}

/** Выход: /login или end_session_endpoint IdP (выход и из plwedding ID). */
export async function signOutAction(): Promise<void> {
  const target = await signOut();
  redirect(target);
}
