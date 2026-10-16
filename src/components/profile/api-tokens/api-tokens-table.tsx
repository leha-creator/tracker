import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ApiTokenDto, ApiTokenState } from '@/modules/api-tokens/client';

import { RevokeApiTokenButton } from './revoke-api-token-button';

// Таблица рендерится на сервере: даты форматируются здесь, без расхождения часовых поясов.
const DATE = new Intl.DateTimeFormat('ru', { dateStyle: 'medium' });
const DATE_TIME = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' });

const STATE_LABELS: Record<ApiTokenState, string> = {
  active: 'Действует',
  expired: 'Истёк',
  revoked: 'Отозван',
};

/** Токены пользователя: сам токен не хранится, виден только префикс. */
export function ApiTokensTable({ items }: { items: ApiTokenDto[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Токенов пока нет. Создайте токен, чтобы подключить Claude Code к задачам.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Название</TableHead>
            <TableHead>Пространство</TableHead>
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
              <TableCell>
                <div className="grid">
                  <span className="font-medium">{token.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {token.prefix}… · создан {DATE.format(token.createdAt)}
                  </span>
                </div>
              </TableCell>
              <TableCell>{token.workspace.name}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
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
                {token.state === 'active' && <RevokeApiTokenButton token={token} />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
