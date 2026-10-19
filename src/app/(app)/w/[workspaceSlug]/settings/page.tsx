import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { SettingsDraftProvider } from '@/components/forms/settings-draft';
import { SettingsSection, SettingsSections } from '@/components/layout/settings-section';
import { DeleteWorkspaceDialog } from '@/components/workspaces/delete-workspace-dialog';
import { RenameWorkspaceForm } from '@/components/workspaces/rename-workspace-form';
import { TaskKeyForm } from '@/components/workspaces/task-key-form';
import { isGithubEnabled } from '@/modules/integrations/github';
import { requireWorkspaceAccessBySlug } from '@/shared/access';

export const metadata: Metadata = { title: 'Настройки пространства — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/settings'>;

export default function WorkspaceSettingsPage({ params }: Props) {
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Настройки пространства</h1>
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent params={params} />
      </Suspense>
    </div>
  );
}

/** Секции: основное, ключ задач, метки, агенты, GitHub, архив. */
function SettingsSkeleton() {
  return (
    <div aria-hidden className="grid divide-y divide-foreground/[0.07]">
      {[3, 1, 1, 1, 1, 1].map((rows, section) => (
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

const LINK_CLASS = 'text-sm text-primary hover:underline';

async function SettingsContent({ params }: Pick<Props, 'params'>) {
  const { workspaceSlug } = await params;
  // Только владелец; остальным — 404.
  const { workspace } = await requireWorkspaceAccessBySlug(workspaceSlug, 'owner');
  const githubEnabled = await isGithubEnabled();

  return (
    <SettingsDraftProvider>
      <SettingsSections>
        <SettingsSection
          title="Основное"
          description={`Название и иконка пространства. Адрес: /w/${workspace.slug}`}
        >
          <RenameWorkspaceForm
            workspaceId={workspace.id}
            name={workspace.name}
            icon={workspace.icon}
          />
        </SettingsSection>
        <SettingsSection
          title="Ключ задач"
          description="Префикс номеров задач. По нему ветки, PR и коммиты GitHub привязываются к задачам."
        >
          <TaskKeyForm workspaceId={workspace.id} taskKey={workspace.taskKey} />
        </SettingsSection>
        <SettingsSection
          title="Метки задач"
          description="Общие метки для всех проектов: фильтр в списке задач и цветные метки на карточках."
        >
          <Link href={`/w/${workspace.slug}/settings/labels`} className={LINK_CLASS}>
            Настроить метки
          </Link>
        </SettingsSection>
        <SettingsSection
          title="Агенты"
          description="Отдельные участники для Claude Code: свои токены, права и ответственный."
        >
          <Link href={`/w/${workspace.slug}/settings/agents`} className={LINK_CLASS}>
            Настроить агентов
          </Link>
        </SettingsSection>
        <SettingsSection
          title="GitHub"
          description="Подключите свои репозитории: PR, ветки и коммиты привязываются к задачам по ключу."
        >
          <Link href={`/w/${workspace.slug}/settings/github`} className={LINK_CLASS}>
            {githubEnabled ? 'Подключить репозитории' : 'Подробнее'}
          </Link>
        </SettingsSection>
        <SettingsSection id="workspace-archive" title="Архив">
          {/* Пояснение над кнопкой, как в настройках проекта. */}
          <div className="grid justify-items-start gap-3">
            <p className="text-sm text-muted-foreground">
              Архивное пространство пропадает у участников, из MCP и интеграций; данные сохраняются.
              Восстановить или удалить его навсегда можно с главной страницы.
            </p>
            <DeleteWorkspaceDialog
              workspaceId={workspace.id}
              name={workspace.name}
              mode="archive"
            />
          </div>
        </SettingsSection>
      </SettingsSections>
    </SettingsDraftProvider>
  );
}
