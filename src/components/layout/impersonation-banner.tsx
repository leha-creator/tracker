import { getMyImpersonation } from '@/modules/admin';

import { PageContainer } from './page-container';
import { StopImpersonationButton } from './stop-impersonation-button';

const TIME = new Intl.DateTimeFormat('ru', { timeStyle: 'short' });

/**
 * Полоса над шапкой при входе администратора от имени пользователя: чьими глазами он смотрит,
 * до какого времени и кнопка возврата. Без имперсонации ничего не рендерит.
 */
export async function ImpersonationBanner() {
  const state = await getMyImpersonation();
  if (!state) return null;
  return (
    <div
      role="status"
      className="border-b border-amber-500/40 bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100"
    >
      <PageContainer
        size="wide"
        className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5 text-sm"
      >
        <p className="min-w-0 flex-1">
          Вы действуете от имени <span className="font-semibold">{state.userName}</span> (вход
          администратора {state.adminName}) до{' '}
          <time dateTime={state.expiresAt.toISOString()}>{TIME.format(state.expiresAt)}</time>.
          Смена пароля, 2FA, сессий и токенов недоступна.
        </p>
        <StopImpersonationButton />
      </PageContainer>
    </div>
  );
}
