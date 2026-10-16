import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { ProjectAutomationForm } from '@/components/github/project-automation-form';
import { SettingsSection, SettingsSections } from '@/components/layout/settings-section';
import { DeleteProjectDialog } from '@/components/projects/delete-project-dialog';
import { ProjectSettingsForm } from '@/components/projects/project-settings-form';
import { SettingsDraftProvider } from '@/components/projects/settings-draft';
import { StatusList } from '@/components/projects/status-list';
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

/** Три секции: основное, статусы, удаление. */
function SettingsSkeleton() {
  return (
    <div aria-hidden className="grid divide-y divide-foreground/[0.07]">
      {[3, 4, 1].map((rows, section) => (
        <div
          key={section}
          className="grid gap-x-10 gap-y-4 py-6 first:pt-2 lg:grid-cols-[15rem_minmax(0,48rem)]"
        >
          <div className="h-5 w-28 animate-pulse rounded bg-muted" />
          <div className="grid gap-3">
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="h-9 animate-pulse rounded-md bg-muted" />
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
        <SettingsSection title="Удаление проекта">
          {/* Пояснение над кнопкой, а не под заголовком: колонки секции одной высоты. */}
          <div className="grid justify-items-start gap-3">
            <p className="text-sm text-muted-foreground">
              Нельзя отменить: проект удалится вместе со статусами, задачи останутся в пространстве.
            </p>
            <DeleteProjectDialog
              workspaceId={workspace.id}
              projectId={project.id}
              name={project.name}
              tasksCount={project.tasksCount}
            />
          </div>
        </SettingsSection>
      </SettingsSections>
    </SettingsDraftProvider>
  );
}
