'use client';

import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { EntityIconTile } from '@/components/entity-icon/entity-icon';
import { NEW_WORKSPACE_HREF } from '@/components/layout/create-panel-href';
import { currentWorkspaceSlug } from '@/components/layout/nav-items';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { WorkspaceListItemDto } from '@/modules/workspaces/client';

import { WORKSPACE_ROLE_LABELS } from './role-label';

/** Выпадающий список пространств. Текущее определяется по URL `/w/[workspaceSlug]`. */
export function WorkspaceSwitcherMenu({ items }: { items: WorkspaceListItemDto[] }) {
  const slug = currentWorkspaceSlug(usePathname());
  const current = items.find((item) => item.slug === slug);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="max-w-48 justify-between gap-1.5 px-2">
          {current && <EntityIconTile icon={current.icon} size="sm" />}
          <span className="truncate font-medium">{current?.name ?? 'Пространства'}</span>
          <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Пространства</DropdownMenuLabel>
        {items.length === 0 && (
          <DropdownMenuItem disabled>Вы пока не состоите ни в одном</DropdownMenuItem>
        )}
        {items.map((item) => (
          <DropdownMenuItem key={item.id} asChild>
            <Link href={`/w/${item.slug}`} className="flex items-center gap-2">
              <EntityIconTile icon={item.icon} size="sm" />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {WORKSPACE_ROLE_LABELS[item.role]}
              </span>
              <CheckIcon
                aria-hidden
                className={item.slug === slug ? 'size-4 shrink-0' : 'size-4 shrink-0 opacity-0'}
              />
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={NEW_WORKSPACE_HREF}>
            <PlusIcon className="size-4" />
            Создать пространство
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
