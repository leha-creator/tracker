'use client';

import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

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

/** Текущее пространство определяется по URL `/w/[workspaceSlug]`. */
function currentSlug(pathname: string): string | undefined {
  const match = /^\/w\/([^/]+)/.exec(pathname);
  return match?.[1];
}

export function WorkspaceSwitcherMenu({ items }: { items: WorkspaceListItemDto[] }) {
  const slug = currentSlug(usePathname());
  const current = items.find((item) => item.slug === slug);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-56 justify-between gap-2">
          <span className="truncate">{current?.name ?? 'Пространства'}</span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Пространства</DropdownMenuLabel>
        {items.length === 0 && (
          <DropdownMenuItem disabled>Вы пока не состоите ни в одном</DropdownMenuItem>
        )}
        {items.map((item) => (
          <DropdownMenuItem key={item.id} asChild>
            <Link href={`/w/${item.slug}`} className="flex items-center justify-between gap-2">
              <span className="truncate">{item.name}</span>
              {item.slug === slug && <CheckIcon className="size-4 shrink-0" />}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/workspaces/new">
            <PlusIcon className="size-4" />
            Создать пространство
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
