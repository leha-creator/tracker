import 'server-only';

import { headers } from 'next/headers';

import { getAuth } from '@/shared/auth';
import { createLogger, maskEmail } from '@/shared/logger';

import { mapAuthError } from './credentials.errors';
import type { SignInInput, SignUpInput } from './credentials.schema';

const log = createLogger('auth.credentials');

export async function signUp(input: SignUpInput): Promise<{ userId: string }> {
  log.debug({ email: maskEmail(input.email) }, '[credentials.signUp] start');
  try {
    const result = await getAuth().api.signUpEmail({
      body: { name: input.name, email: input.email, password: input.password },
      headers: await headers(),
    });
    log.info({ userId: result.user.id }, '[credentials.signUp] user registered');
    return { userId: result.user.id };
  } catch (error) {
    const mapped = mapAuthError(error);
    log.warn(
      { email: maskEmail(input.email), code: (mapped as { code?: string }).code },
      '[credentials.signUp] failed',
    );
    throw mapped;
  }
}

export async function signIn(input: SignInInput): Promise<{ userId: string }> {
  log.debug({ email: maskEmail(input.email) }, '[credentials.signIn] start');
  try {
    const result = await getAuth().api.signInEmail({
      body: { email: input.email, password: input.password },
      headers: await headers(),
    });
    log.info({ userId: result.user.id }, '[credentials.signIn] signed in');
    return { userId: result.user.id };
  } catch (error) {
    const mapped = mapAuthError(error);
    log.warn(
      { email: maskEmail(input.email), code: (mapped as { code?: string }).code },
      '[credentials.signIn] failed',
    );
    throw mapped;
  }
}

export async function signOut(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() });
  log.info('[credentials.signOut] signed out');
}
