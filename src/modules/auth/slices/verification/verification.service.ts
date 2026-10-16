import 'server-only';

import { isAPIError } from 'better-auth/api';
import { headers } from 'next/headers';

import { safeRedirectPath } from '@/shared/access';
import { getAuth, verifyEmailCallbackPath } from '@/shared/auth';
import { createLogger, maskEmail } from '@/shared/logger';
import { enforceRateLimit, getClientIp } from '@/shared/rate-limit';

import { mapAuthError } from '../credentials/credentials.errors';
import type { ResendVerificationInput } from './verification.schema';

const log = createLogger('auth.verification');

/**
 * Повторная отправка письма подтверждения. Ответ всегда одинаковый: по нему нельзя понять,
 * есть ли такой аккаунт и подтверждён ли он. Ошибки «не найден» и «уже подтверждён» не
 * показываются; превышение лимита — показывается.
 */
export async function resendVerificationEmail(input: ResendVerificationInput): Promise<void> {
  const email = maskEmail(input.email);
  log.debug({ email }, '[verification.resend] start');
  const requestHeaders = await headers();
  await enforceRateLimit('verification-resend', {
    ip: getClientIp(requestHeaders),
    email: input.email,
  });

  try {
    await getAuth().api.sendVerificationEmail({
      body: {
        email: input.email,
        callbackURL: verifyEmailCallbackPath(safeRedirectPath(input.returnTo)),
      },
      headers: requestHeaders,
    });
    log.info({ email }, '[verification.resend] requested');
  } catch (error) {
    if (isAPIError(error) && error.statusCode !== 429) {
      const code = typeof error.body?.code === 'string' ? error.body.code : undefined;
      log.debug({ email, code }, '[verification.resend] ignored');
      return;
    }
    const mapped = mapAuthError(error);
    log.warn({ email, code: (mapped as { code?: string }).code }, '[verification.resend] failed');
    throw mapped;
  }
}
