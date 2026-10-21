import { Callout } from '@/components/feedback/callout';
import { getIdpSignInStatus, IDP_UNAVAILABLE_MESSAGE, idpSignInErrorMessage } from '@/modules/auth';

import { IdpSignInButton } from './idp-sign-in-button';

/**
 * Вход через IdP plwedding ID — единственный способ входа. Пока IdP не отвечает, вместо кнопки —
 * пояснение (провайдер подключится при следующей проверке discovery).
 */
export async function IdpSignIn({ returnTo, errorCode }: { returnTo: string; errorCode?: string }) {
  const status = await getIdpSignInStatus();
  if (status === 'unavailable') return <Callout tone="warning">{IDP_UNAVAILABLE_MESSAGE}</Callout>;
  return <IdpSignInButton returnTo={returnTo} error={idpSignInErrorMessage(errorCode)} />;
}
