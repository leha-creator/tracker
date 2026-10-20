import { Suspense } from 'react';

import { SettingsSection, SettingsSections } from '@/components/layout/settings-section';
import { ProfileAvatarForm } from '@/components/profile/profile-avatar-form';
import { ProfileForm } from '@/components/profile/profile-form';
import { Skeleton } from '@/components/ui/skeleton';
import { getMyProfile } from '@/modules/profiles';
import { requireUserOrRedirect } from '@/shared/access';

export default function ProfilePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <ProfileSections />
    </Suspense>
  );
}

async function ProfileSections() {
  const session = await requireUserOrRedirect('/profile');
  const profile = await getMyProfile(session);

  return (
    <SettingsSections>
      <SettingsSection
        title="Фото"
        description="Видно участникам ваших пространств. PNG, JPEG или WebP до 2 МБ."
      >
        <ProfileAvatarForm name={profile.name} image={profile.image} />
      </SettingsSection>
      <SettingsSection
        title="О себе"
        description="Имя, должность и описание показываются в профиле и в карточке при наведении."
      >
        <ProfileForm
          name={profile.name}
          position={profile.position ?? ''}
          bio={profile.bio ?? ''}
        />
      </SettingsSection>
    </SettingsSections>
  );
}
