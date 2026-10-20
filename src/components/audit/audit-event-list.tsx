import {
  BuildingIcon,
  FileTextIcon,
  ShieldAlertIcon,
  ShieldIcon,
  UserCogIcon,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';

import { ViaAgentBadge } from '@/components/agents/via-agent-badge';
import { EmptyState } from '@/components/feedback/empty-state';
import { ToneBadge } from '@/components/feedback/tone-badge';
import { UserAvatar } from '@/components/users/user-avatar';
import { cn } from '@/lib/utils';
import type { AuditEventDto, AuditEventPageDto } from '@/modules/audit/client';

// Лента рендерится на сервере: даты форматируются здесь, без расхождения часовых поясов.
const DATE_TIME = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' });

const CATEGORY_ICONS: Record<AuditEventDto['category'], LucideIcon> = {
  security: ShieldIcon,
  workspace: BuildingIcon,
  content: FileTextIcon,
  admin: UserCogIcon,
};

interface AuditEventListProps {
  page: AuditEventPageDto;
  /** Адрес следующей страницы по курсору. */
  nextHref: (cursor: string) => string;
  /**
   * Показывать автора со ссылкой на карточку в админке — для журнала администратора. В ленте
   * участника автор один и уже в заголовке страницы.
   */
  showActor?: boolean;
  /** Показывать пространство события (общий журнал, свой журнал безопасности). */
  showWorkspace?: boolean;
  emptyText: string;
}

/** Лента событий журнала: иконка категории, текст со ссылкой, автор, время, IP и устройство. */
export function AuditEventList({
  page,
  nextHref,
  showActor = false,
  showWorkspace = false,
  emptyText,
}: AuditEventListProps) {
  if (page.items.length === 0) {
    return <EmptyState variant="compact" title={emptyText} />;
  }
  return (
    <div className="grid gap-3">
      <ol className="grid divide-y rounded-xl border">
        {page.items.map((event) => (
          <AuditEventItem
            key={event.id}
            event={event}
            showActor={showActor}
            showWorkspace={showWorkspace}
          />
        ))}
      </ol>
      {page.nextCursor && (
        <Link
          href={nextHref(page.nextCursor)}
          className="w-fit text-sm text-primary hover:underline"
          scroll={false}
        >
          Более ранние события
        </Link>
      )}
    </div>
  );
}

function AuditEventItem({
  event,
  showActor,
  showWorkspace,
}: {
  event: AuditEventDto;
  showActor: boolean;
  showWorkspace: boolean;
}) {
  const failed = event.kind === 'auth.sign_in_failed';
  const Icon = failed ? ShieldAlertIcon : CATEGORY_ICONS[event.category];
  const meta = [
    showWorkspace && event.workspace ? `«${event.workspace.name}»` : null,
    event.ip,
    event.device,
  ].filter(Boolean);

  return (
    <li className="flex min-w-0 gap-3 px-4 py-2.5 text-sm">
      <Icon
        aria-hidden
        className={cn(
          'mt-0.5 size-4 shrink-0',
          failed ? 'text-destructive' : 'text-muted-foreground',
        )}
      />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className="break-words">
          {event.href ? (
            <Link href={event.href} className="hover:underline">
              {event.text}
            </Link>
          ) : (
            event.text
          )}
        </span>
        {event.details && (
          <span className="text-xs break-words text-muted-foreground">{event.details}</span>
        )}
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          {showActor && <ActorLabel actor={event.actor} />}
          <time dateTime={event.createdAt.toISOString()}>{DATE_TIME.format(event.createdAt)}</time>
          {meta.map((item) => (
            <span key={item} className="break-all">
              · {item}
            </span>
          ))}
          {event.impersonator && (
            <ToneBadge tone="warning">через администратора {event.impersonator.name}</ToneBadge>
          )}
          <ViaAgentBadge via={event.viaTokenName ? { tokenName: event.viaTokenName } : null} />
        </span>
      </div>
    </li>
  );
}

function ActorLabel({ actor }: { actor: AuditEventDto['actor'] }) {
  if (!actor) return <span>Система ·</span>;
  const content = (
    <>
      <UserAvatar user={{ name: actor.name, image: actor.image }} size="xs" className="size-4" />
      <span className="font-medium text-foreground">{actor.name}</span>
    </>
  );
  return (
    <span className="inline-flex items-center gap-1">
      {actor.id && !actor.isAgent ? (
        <Link
          href={`/admin/users/${actor.id}`}
          className="inline-flex items-center gap-1 hover:underline"
        >
          {content}
        </Link>
      ) : (
        content
      )}
      <span>·</span>
    </span>
  );
}
