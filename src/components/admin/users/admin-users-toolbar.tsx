'use client';

import { ChevronDownIcon, SearchIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  ADMIN_USER_STATUS_LABELS,
  ADMIN_USER_STATUSES,
  ADMIN_USERS_QUERY_MAX_LENGTH,
  clearAdminUserFilters,
  hasActiveAdminUserFilters,
  patchAdminUserListQuery,
  type AdminUserStatus,
} from '@/modules/admin/client';
import type { GlobalRole } from '@/shared/access/global-role';

import { useAdminUsers } from './admin-users-shell';

const SEARCH_DELAY_MS = 300;
const ANY = 'any';

const ROLE_LABELS: Record<GlobalRole, string> = {
  admin: 'Администраторы',
  user: 'Пользователи',
};

/** Поиск и фильтры списка пользователей. Значения — из URL, изменения — навигацией. */
export function AdminUsersToolbar() {
  const { query, navigate } = useAdminUsers();

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="search"
      aria-label="Фильтры пользователей"
    >
      <UserSearch />
      <RadioFilter
        label="Роль"
        value={query.role}
        options={(['admin', 'user'] as const).map((role) => ({
          value: role,
          label: ROLE_LABELS[role],
        }))}
        onChange={(role) => navigate(patchAdminUserListQuery(query, { role }))}
      />
      <RadioFilter
        label="Статус"
        value={query.status}
        options={ADMIN_USER_STATUSES.map((status) => ({
          value: status,
          label: ADMIN_USER_STATUS_LABELS[status],
        }))}
        onChange={(status: AdminUserStatus | null) =>
          navigate(patchAdminUserListQuery(query, { status }))
        }
      />
      {hasActiveAdminUserFilters(query) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigate(clearAdminUserFilters(query))}
        >
          <XIcon />
          Сбросить фильтры
        </Button>
      )}
    </div>
  );
}

interface RadioFilterProps<T extends string> {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (value: T | null) => void;
}

function RadioFilter<T extends string>({ label, value, options, onChange }: RadioFilterProps<T>) {
  const selected = options.find((option) => option.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(selected && 'border-primary/50 bg-primary/5')}
        >
          {selected ? `${label}: ${selected.label}` : label}
          <ChevronDownIcon className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value ?? ANY}
          onValueChange={(next) => onChange(next === ANY ? null : (next as T))}
        >
          <DropdownMenuRadioItem value={ANY}>Все</DropdownMenuRadioItem>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Поиск с задержкой. Черновик синхронизируется с `query.q`, когда тот меняется извне
 * («Сбросить фильтры», «назад») — как в списке задач.
 */
function UserSearch() {
  const { query, navigate } = useAdminUsers();
  const [draft, setDraft] = useState(query.q);
  const [syncedQ, setSyncedQ] = useState(query.q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Отложенный поиск применяется к актуальному запросу, а не к тому, что был при вводе.
  const latestQuery = useRef(query);
  useEffect(() => {
    latestQuery.current = query;
  });

  if (query.q !== syncedQ) {
    setSyncedQ(query.q);
    setDraft(query.q);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  function submit(value: string) {
    clearTimeout(timer.current);
    const current = latestQuery.current;
    const q = value.trim().replace(/\s+/g, ' ');
    if (q === current.q) return;
    navigate(patchAdminUserListQuery(current, { q }), { replace: true });
  }

  function change(value: string) {
    setDraft(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => submit(value), SEARCH_DELAY_MS);
  }

  return (
    <div className="relative w-full sm:w-64">
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={draft}
        maxLength={ADMIN_USERS_QUERY_MAX_LENGTH}
        placeholder="Имя или email"
        aria-label="Поиск пользователей"
        className="h-8 pl-8"
        onChange={(event) => change(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit(draft);
          if (event.key === 'Escape' && draft) {
            event.preventDefault();
            setDraft('');
            submit('');
          }
        }}
      />
    </div>
  );
}
