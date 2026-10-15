import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/modules/auth';
import { isAdmin, requireUserOrRedirect } from '@/shared/access';

/** Данные пользователя в шапке. Читает сессию — рендерить внутри <Suspense>. */
export async function UserMenu() {
  const { user } = await requireUserOrRedirect();
  const admin = isAdmin(user);

  return (
    <div className="flex items-center gap-3">
      {/* Ссылка скрыта для не-админов ради UX; доступ проверяет сама страница /admin. */}
      {admin && (
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin">Админка</Link>
        </Button>
      )}
      <div className="hidden text-right text-sm sm:block">
        <div className="font-medium">{user.name}</div>
        <div className="text-muted-foreground">{user.email}</div>
      </div>
      {admin && <Badge variant="secondary">Администратор</Badge>}
      <form action={signOutAction}>
        <Button type="submit" variant="outline" size="sm">
          Выйти
        </Button>
      </form>
    </div>
  );
}
