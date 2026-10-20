import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { ProjectAutomationForm } from '@/components/github/project-automation-form';
import { SettingsSection, SettingsSections } from '@/components/layout/settings-section';
import { DeleteProjectDialog } from '@/components/projects/delete-project-dialog';
import { ProjectArchiveButton } from '@/components/projects/project-archive-button';
import { ProjectSettingsForm } from '@/components/projects/project-settings-form';
import { SettingsDraftProvider } from '@/components/forms/settings-draft';
import { StatusList } from '@/components/projects/status-list';
import { Skeleton } from '@/components/ui/skeleton';
import { getProjectAutomation, isGithubEnabled } from '@/modules/integrations/github';
import { listStatuses } from '@/modules/projects';

import { loadProjectPage } from '../_lib/load-project';

export const metadata: Metadata = { title: 'Настройки проекта — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/projects/[projectId]/settings'>;

export default function ProjectSettingsPage({ params }: Props) {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsContent params={params} />
    </Suspense>
  );
}

/** Три секции: основное, статусы, архив. */
function SettingsSkeleton() {
  return (
    <div aria-hidden className="grid divide-y divide-foreground/[0.07]">
      {[3, 4, 1].map((rows, section) => (
        <div
          key={section}
          className="grid gap-x-10 gap-y-4 py-6 first:pt-2 lg:grid-cols-[15rem_minmax(0,48rem)]"
        >
          <Skeleton className="h-5 w-28 rounded-sm" />
          <div className="grid gap-3">
            {Array.from({ length: rows }, (_, row) => (
              <Skeleton key={row} className="h-9" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

async function SettingsContent({ params }: Pick<Props, 'params'>) {
  const { workspaceSlug, projectId } = await params;
  const { session, workspace, project, access } = await loadProjectPage(workspaceSlug, projectId);
  // Без права управления проектами — 404; сервер всё равно проверяет право в каждом action.
  if (!access.permissions.manageProjects) notFound();
  // Архивный проект только для чтения: из настроек остаются восстановление и удаление.
  if (project.archivedAt) {
    return (
      <SettingsSections>
        <ArchiveSection workspaceId={workspace.id} project={project} />
      </SettingsSections>
    );
  }
  const githubEnabled = await isGithubEnabled();
  const [statuses, automation] = await Promise.all([
    listStatuses(session, workspace.id, project.id),
    githubEnabled ? getProjectAutomation(session, workspace.id, project.id) : null,
  ]);

  return (
    <SettingsDraftProvider>
      <SettingsSections>
        <SettingsSection title="Основное" description="Название, иконка и описание проекта.">
          <ProjectSettingsForm project={project} />
        </SettingsSection>
        <SettingsSection
          title="Статусы"
          description="Колонки доски слева направо: порядок меняется перетаскиванием за ручку. Категория определяет, считается ли задача выполненной."
        >
          <StatusList workspaceId={workspace.id} projectId={project.id} statuses={statuses} />
        </SettingsSection>
        {automation && (
          <SettingsSection
            title="GitHub"
            description="Задачи с привязанным PR переходят в выбранный статус этого проекта. Задача в нескольких проектах меняет статус в каждом по его настройке."
          >
            <ProjectAutomationForm
              workspaceId={workspace.id}
              projectId={project.id}
              statuses={statuses}
              prOpenedStatusId={automation.prOpenedStatusId}
              prMergedStatusId={automation.prMergedStatusId}
            />
          </SettingsSection>
        )}
        <ArchiveSection workspaceId={workspace.id} project={project} />
      </SettingsSections>
    </SettingsDraftProvider>
  );
}

/** Архив проекта: в архив — обратимо; удалить навсегда можно только архивный проект. */
function ArchiveSection({
  workspaceId,
  project,
}: {
  workspaceId: string;
  project: { id: string; name: string; tasksCount: number; archivedAt: Date | null };
}) {
  const archived = project.archivedAt !== null;
  return (
    <SettingsSection id="project-archive" title="Архив">
      {/* Пояснение над кнопками, а не под заголовком: колонки секции одной высоты. */}
      <div className="grid justify-items-start gap-3">
        <p className="text-sm text-muted-foreground">
          {archived
            ? 'Проект в архиве: доска и статусы только для чтения, задачи остались в пространстве. Удаление проекта нельзя отменить.'
            : 'Проект пропадёт из списка проектов, доска станет только для чтения. Восстановить его можно в любой момент; удалить навсегда — только из архива.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <ProjectArchiveButton
            workspaceId={workspaceId}
            projectId={project.id}
            archived={archived}
          />
          {archived && (
            <DeleteProjectDialog
              workspaceId={workspaceId}
              projectId={project.id}
              name={project.name}
              tasksCount={project.tasksCount}
            />
          )}
        </div>
      </div>
    </SettingsSection>
  );
}
