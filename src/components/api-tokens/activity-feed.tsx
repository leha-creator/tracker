import Link from 'next/link';

import type { McpActivityPageDto } from '@/modules/api-tokens/client';

// Лента рендерится на сервере: даты форматируются здесь, без расхождения часовых поясов.
const DATE_TIME = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ссылка на цель записи: документ (id) или задача (TSK-42 / #42). */
function targetHref(workspaceSlug: string, targetKey: string | null): string | null {
  if (!targetKey) return null;
  if (UUID.test(targetKey)) return `/w/${workspaceSlug}/docs/${targetKey}`;
  const number = /(\d+)$/.exec(targetKey)?.[1];
  return number ? `/w/${workspaceSlug}/tasks/${number}` : null;
}

interface ActivityFeedProps {
  page: McpActivityPageDto;
  workspaceSlug: string;
  /** Колонка токена: в журнале агента токенов несколько. */
  showToken?: boolean;
  /** Адрес следующей страницы по курсору; без него ссылки нет. */
  nextHref: (cursor: string) => string;
}

/** Журнал изменений через MCP: время, токен, действие, ссылка на задачу или документ. */
export function ActivityFeed({ page, workspaceSlug, showToken, nextHref }: ActivityFeedProps) {
  if (page.items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Действий пока нет. Здесь появятся изменения, которые агент делает через MCP.
      </p>
    );
  }
  return (
    <div className="grid gap-3">
      <ol className="grid divide-y rounded-xl border">
        {page.items.map((item) => {
          const href = targetHref(workspaceSlug, item.targetKey);
          return (
            <li key={item.id} className="grid gap-0.5 px-4 py-2.5 text-sm">
              <span className="break-words">
                {href ? (
                  <Link href={href} className="hover:underline">
                    {item.summary}
                  </Link>
                ) : (
                  item.summary
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                <time dateTime={item.createdAt.toISOString()}>
                  {DATE_TIME.format(item.createdAt)}
                </time>
                {showToken && ` · токен «${item.tokenName ?? 'удалён'}»`}
                <span className="font-mono"> · {item.tool}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {page.nextCursor && (
        <Link
          href={nextHref(page.nextCursor)}
          className="w-fit text-sm text-primary hover:underline"
          scroll={false}
        >
          Более ранние действия
        </Link>
      )}
    </div>
  );
}
