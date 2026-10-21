import { Suspense } from 'react';

import { StorageSettingsForm } from '@/components/admin/settings/storage-settings-form';
import { SettingsSections } from '@/components/layout/settings-section';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelativeTime } from '@/lib/format-relative-time';
import { getAdminResourceSettings } from '@/modules/admin';
import { requireAdminOrNotFound } from '@/shared/access';

// Без metadata.title: заголовок в статическом shell раскрыл бы раздел не-администратору.

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <SettingsContent />
    </Suspense>
  );
}

async function SettingsContent() {
  await requireAdminOrNotFound('/admin/settings');
  const settings = await getAdminResourceSettings();
  return (
    <div className="grid gap-2">
      {settings.updatedAt && (
        <p className="text-sm text-muted-foreground">
          Изменено {formatRelativeTime(settings.updatedAt)}
          {settings.updatedBy ? ` · ${settings.updatedBy.name}` : ''}
        </p>
      )}
      <SettingsSections>
        <StorageSettingsForm storage={settings.storage} />
      </SettingsSections>
    </div>
  );
}
