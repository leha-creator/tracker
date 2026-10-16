import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { WorkspaceListItemDto } from '@/modules/workspaces';

import { WORKSPACE_ROLE_LABELS } from './role-label';

function membersLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} участник`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} участника`;
  return `${count} участников`;
}

export function WorkspaceList({ items }: { items: WorkspaceListItemDto[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <CardTitle>Пока нет пространств</CardTitle>
          <CardDescription>
            Создайте пространство для команды или примите приглашение по ссылке из письма.
          </CardDescription>
          <Button asChild className="mt-2 justify-self-center">
            <Link href="/workspaces/new">Создать пространство</Link>
          </Button>
        </CardHeader>
      </Card>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((workspace) => (
        <li key={workspace.id}>
          <Link
            href={`/w/${workspace.slug}`}
            className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="truncate">{workspace.name}</CardTitle>
                  <Badge variant={workspace.role === 'owner' ? 'default' : 'secondary'}>
                    {WORKSPACE_ROLE_LABELS[workspace.role]}
                  </Badge>
                </div>
                <CardDescription>
                  /w/{workspace.slug} · {membersLabel(workspace.membersCount)}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
