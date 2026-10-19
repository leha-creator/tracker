import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Link from 'next/link';

import {
  API_TOKEN_SCOPE_LABELS,
  type ApiTokenDto,
  type ApiTokenState,
} from '@/modules/api-tokens/client';

import { RevokeApiTokenButton, type RevokeTarget } from './revoke-api-token-button';

// Таблица рендерится на сервере: даты форматируются здесь, без расхождения часовых поясов.
const DATE = new Intl.DateTimeFormat('ru', { dateStyle: 'medium' });
const DATE_TIME = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' });

const STATE_LABELS: Record<ApiTokenState, string> = {
  active: 'Действует',
  expired: 'Истёк',
  revoked: 'Отозван',
};

interface ApiTokensTableProps {
  items: ApiTokenDto[];
  /** Свои токены (профиль) или токены агента (страница агента). */
  target: RevokeTarget;
  /** Колонка «Пространство» — у токенов агента пространство одно, колонка не нужна. */
  showWorkspace?: boolean;
  /** Адрес журнала действий токена; без него ссылки нет. */
  activityHref?: (tokenId: string) => string;
  emptyText?: string;
}

/** Токены: сам токен не хранится, виден только префикс. */
export function ApiTokensTable({
  items,
  target,
  showWorkspace = true,
  activityHref,
  emptyText = 'Токенов пока нет. Создайте токен, чтобы подключить Claude Code к задачам.',
}: ApiTokensTableProps) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Название</TableHead>
            {showWorkspace && <TableHead>Пространство</TableHead>}
            <TableHead>Области</TableHead>
            <TableHead>Использован</TableHead>
            <TableHead>Истекает</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead className="w-0">
              <span className="sr-only">Действия</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((token) => (
            <TableRow
              key={token.id}
              className={token.state === 'active' ? undefined : 'opacity-60'}
            >
              <TableCell className="whitespace-normal">
                <div className="grid">
                  <span className="font-medium">{token.name}</span>
                  <span className="font-mono text-xs break-all text-muted-foreground">
                    {token.prefix}… · создан {DATE.format(token.createdAt)}
                  </span>
                  {activityHref && (
                    <Link
                      href={activityHref(token.id)}
                      className="w-fit text-xs text-primary hover:underline"
                    >
                      Журнал
                    </Link>
                  )}
                </div>
              </TableCell>
              {showWorkspace && <TableCell>{token.workspace.name}</TableCell>}
              <TableCell className="text-sm whitespace-normal text-muted-foreground">
                {token.scopes.map((scope) => API_TOKEN_SCOPE_LABELS[scope]).join(', ')}
              </TableCell>
              <TableCell className="text-sm whitespace-normal text-muted-foreground">
                {token.lastUsedAt ? DATE_TIME.format(token.lastUsedAt) : 'Ни разу'}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {token.expiresAt ? DATE.format(token.expiresAt) : 'Бессрочно'}
              </TableCell>
              <TableCell>
                <Badge variant={token.state === 'active' ? 'secondary' : 'outline'}>
                  {STATE_LABELS[token.state]}
                </Badge>
              </TableCell>
              <TableCell>
                {token.state === 'active' && <RevokeApiTokenButton token={token} target={target} />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
