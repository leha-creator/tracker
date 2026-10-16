'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { currentWorkspaceSlug } from '@/components/layout/nav-items';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { WORKSPACE_ROLE_LABELS } from '@/components/workspaces/role-label';

import type { MemberCardData } from './member-card';
import { UserAvatar } from './user-avatar';

type CardState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: MemberCardData };

// Карточки на время жизни страницы: повторное наведение не ходит на сервер.
const cache = new Map<string, MemberCardData>();

/** Данные карточки: из кеша страницы или загруженные при первом открытии. */
function useMemberCard(slug: string, userId: string, open: boolean): CardState {
  const key = `${slug}/${userId}`;
  const [result, setResult] = useState<{ key: string; data: MemberCardData | null } | null>(null);

  useEffect(() => {
    if (!open || cache.has(key)) return;
    const controller = new AbortController();
    fetch(`/api/w/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}/card`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as MemberCardData;
        cache.set(key, data);
        setResult({ key, data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, data: null });
      });
    return () => controller.abort();
  }, [key, open, slug, userId]);

  const cached = cache.get(key);
  if (cached) return { status: 'ready', data: cached };
  if (result?.key === key && result.data === null) return { status: 'error' };
  return { status: 'loading' };
}

interface UserHoverCardProps {
  user: { userId: string; name: string; image?: string | null };
  /** Триггер: аватар, имя, @упоминание. */
  children: ReactNode;
  /**
   * Триггер можно сфокусировать с клавиатуры (обычная ссылка на профиль). Внутри другой ссылки
   * (карточка доски) — false: карточка открывается только наведением указателя.
   */
  focusable?: boolean;
  className?: string;
}

/**
 * Предпросмотр участника пространства при наведении: фото, должность, роль, email, открытые задачи
 * и ссылка на профиль. Пространство — из адреса страницы; вне `/w/*` показывается только триггер.
 */
export function UserHoverCard({ user, children, focusable = true, className }: UserHoverCardProps) {
  const pathname = usePathname();
  const slug = currentWorkspaceSlug(pathname);
  const [open, setOpen] = useState(false);
  const state = useMemberCard(slug ?? '', user.userId, open && slug !== undefined);

  if (!slug) return <span className={className}>{children}</span>;
  const profileHref = `/w/${slug}/members/${user.userId}`;

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={400} closeDelay={100}>
      <HoverCardTrigger asChild>
        {focusable ? (
          <Link href={profileHref} className={className}>
            {children}
          </Link>
        ) : (
          <span className={className}>{children}</span>
        )}
      </HoverCardTrigger>
      <HoverCardContent className="w-72 p-3" align="start">
        <div className="flex gap-3">
          <UserAvatar
            user={{
              name: user.name,
              image: state.status === 'ready' ? state.data.image : (user.image ?? null),
            }}
            size="md"
          />
          <div className="grid min-w-0 flex-1 gap-0.5">
            <span className="truncate font-medium">{user.name}</span>
            {state.status === 'ready' ? (
              <>
                {state.data.position && (
                  <span className="truncate text-muted-foreground">{state.data.position}</span>
                )}
                <span className="truncate text-xs text-muted-foreground">
                  {WORKSPACE_ROLE_LABELS[state.data.role]} · {state.data.email}
                </span>
              </>
            ) : state.status === 'loading' ? (
              <span className="mt-1 h-3 w-32 animate-pulse rounded bg-muted" aria-hidden />
            ) : (
              <span className="text-xs text-muted-foreground">Не удалось загрузить</span>
            )}
          </div>
        </div>
        {state.status === 'ready' && (
          <p className="mt-3 text-xs text-muted-foreground">
            Открытых задач: {state.data.openCount}
            {state.data.overdueCount > 0 && (
              <span className="text-destructive"> · просрочено {state.data.overdueCount}</span>
            )}
          </p>
        )}
        <Link
          href={profileHref}
          className="mt-3 block rounded-md bg-muted px-3 py-1.5 text-center text-sm font-medium hover:bg-muted/70"
        >
          Открыть профиль
        </Link>
      </HoverCardContent>
    </HoverCard>
  );
}
