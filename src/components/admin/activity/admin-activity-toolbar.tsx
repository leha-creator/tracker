'use client';

import { XIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AUDIT_CATEGORY_LABELS,
  AUDIT_KIND_LABELS,
  EMPTY_ADMIN_AUDIT_QUERY,
  hasActiveAuditFilters,
  type AdminAuditQuery,
} from '@/modules/audit/client';
import { AUDIT_CATEGORIES, auditCategoryOf, auditKindsOfCategory } from '@/shared/audit/client';

import { adminActivityHref } from './admin-activity-href';

const ANY = 'any';

interface AdminActivityToolbarProps {
  query: AdminAuditQuery;
  /** Имена выбранных пользователя и пространства — для снимаемых фильтров. */
  userName: string | null;
  workspaceName: string | null;
}

/**
 * Фильтры журнала: категория, тип, период; пользователь и пространство приходят ссылками
 * (из карточек) и снимаются кнопкой. Состояние — в URL, страница рендерится на сервере.
 */
export function AdminActivityToolbar({
  query,
  userName,
  workspaceName,
}: AdminActivityToolbarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(patch: Partial<AdminAuditQuery>) {
    const next = { ...query, ...patch, cursor: null };
    // Тип другой категории со сменой категории сбрасывается.
    if (next.kind && next.category && auditCategoryOf(next.kind) !== next.category) {
      next.kind = null;
    }
    startTransition(() => router.push(adminActivityHref(next), { scroll: false }));
  }

  const kindCategories = query.category ? [query.category] : AUDIT_CATEGORIES;

  return (
    <div
      role="search"
      aria-label="Фильтры журнала"
      aria-busy={isPending || undefined}
      className="flex flex-wrap items-end gap-2"
    >
      <Select
        value={query.category ?? ANY}
        onValueChange={(value) =>
          navigate({ category: value === ANY ? null : (value as AdminAuditQuery['category']) })
        }
      >
        <SelectTrigger size="sm" aria-label="Категория" className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Все категории</SelectItem>
          {AUDIT_CATEGORIES.map((category) => (
            <SelectItem key={category} value={category}>
              {AUDIT_CATEGORY_LABELS[category]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={query.kind ?? ANY}
        onValueChange={(value) =>
          navigate({ kind: value === ANY ? null : (value as AdminAuditQuery['kind']) })
        }
      >
        <SelectTrigger size="sm" aria-label="Тип события" className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Все типы</SelectItem>
          {kindCategories.map((category) => (
            <SelectGroup key={category}>
              <SelectLabel>{AUDIT_CATEGORY_LABELS[category]}</SelectLabel>
              {auditKindsOfCategory(category).map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {AUDIT_KIND_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      <label className="grid gap-1 text-xs text-muted-foreground">
        С
        <Input
          type="date"
          className="h-8 w-40"
          defaultValue={query.from ?? ''}
          max={query.to ?? undefined}
          onChange={(event) => navigate({ from: event.target.value || null })}
        />
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        По
        <Input
          type="date"
          className="h-8 w-40"
          defaultValue={query.to ?? ''}
          min={query.from ?? undefined}
          onChange={(event) => navigate({ to: event.target.value || null })}
        />
      </label>

      {query.userId && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => navigate({ userId: null })}
        >
          Пользователь: {userName ?? 'выбран'}
          <XIcon aria-label="Снять фильтр" />
        </Button>
      )}
      {query.workspaceId && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => navigate({ workspaceId: null })}
        >
          Пространство: {workspaceName ?? 'выбрано'}
          <XIcon aria-label="Снять фильтр" />
        </Button>
      )}
      {hasActiveAuditFilters(query) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigate(EMPTY_ADMIN_AUDIT_QUERY)}
        >
          <XIcon />
          Сбросить фильтры
        </Button>
      )}
    </div>
  );
}
