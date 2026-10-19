import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { WORKSPACE_ROLE_LABELS } from '@/components/workspaces/role-label';
import type { UserMembershipDto } from '@/modules/workspaces/client';

const DATE = new Intl.DateTimeFormat('ru', { dateStyle: 'medium' });

/** Пространства пользователя с ролью и правами; ссылка — на карточку пространства в админке. */
export function UserMemberships({ items }: { items: UserMembershipDto[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Пользователь не состоит ни в одном пространстве.
      </p>
    );
  }
  return (
    <ul className="grid divide-y rounded-xl border">
      {items.map((item) => (
        <li
          key={item.workspace.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
        >
          <Link
            href={`/admin/workspaces/${item.workspace.id}`}
            className="min-w-0 flex-1 truncate font-medium hover:underline"
          >
            {item.workspace.name}
          </Link>
          {item.workspace.archived && <Badge variant="outline">В архиве</Badge>}
          <Badge variant={item.role === 'owner' ? 'default' : 'secondary'}>
            {WORKSPACE_ROLE_LABELS[item.role]}
          </Badge>
          {item.role !== 'owner' && item.canManageProjects && (
            <Badge variant="outline">Проекты</Badge>
          )}
          {item.role !== 'owner' && item.canManageDocuments && (
            <Badge variant="outline">Документы</Badge>
          )}
          <span className="text-xs text-muted-foreground">
            с <time dateTime={item.joinedAt.toISOString()}>{DATE.format(item.joinedAt)}</time>
          </span>
        </li>
      ))}
    </ul>
  );
}
