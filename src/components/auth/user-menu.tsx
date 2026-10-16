import { signOutAction } from '@/modules/auth';
import { isAdmin, requireUserOrRedirect } from '@/shared/access';

import { UserMenuDropdown } from './user-menu-dropdown';

/** Меню пользователя в шапке. Читает сессию — рендерить внутри <Suspense>. */
export async function UserMenu() {
  const { user } = await requireUserOrRedirect();
  return (
    <UserMenuDropdown
      name={user.name}
      email={user.email}
      image={user.image}
      isAdmin={isAdmin(user)}
      signOutAction={signOutAction}
    />
  );
}
