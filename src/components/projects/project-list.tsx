import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProjectListItemDto } from '@/modules/projects';

function statusesLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} статус`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} статуса`;
  return `${count} статусов`;
}

interface ProjectListProps {
  workspaceSlug: string;
  items: ProjectListItemDto[];
  canManage: boolean;
}

export function ProjectList({ workspaceSlug, items, canManage }: ProjectListProps) {
  const base = `/w/${workspaceSlug}/projects`;

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <CardTitle>Проектов пока нет</CardTitle>
          <CardDescription>
            {canManage
              ? 'Создайте первый проект: у него сразу будут колонки «К выполнению», «В работе» и «Готово».'
              : 'Проекты появятся, когда их создаст владелец пространства или участник с правом управления проектами.'}
          </CardDescription>
          {canManage && (
            <Button asChild className="mt-2 justify-self-center">
              <Link href={`${base}/new`}>Создать проект</Link>
            </Button>
          )}
        </CardHeader>
      </Card>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((project) => (
        <li key={project.id}>
          <Link
            href={`${base}/${project.id}/board`}
            className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="truncate">{project.name}</CardTitle>
                <CardDescription className="truncate">
                  {project.description ?? 'Без описания'}
                </CardDescription>
                <p className="text-sm text-muted-foreground">
                  {statusesLabel(project.statusesCount)}
                </p>
              </CardHeader>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
