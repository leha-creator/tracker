import Link from 'next/link';

import { newProjectHref } from '@/components/layout/create-panel-href';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProjectListItemDto } from '@/modules/projects';

import { ProjectCard } from './project-card';

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
              <Link href={newProjectHref(workspaceSlug)} scroll={false}>
                Создать проект
              </Link>
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
          <ProjectCard href={`${base}/${project.id}/board`} project={project} />
        </li>
      ))}
    </ul>
  );
}
