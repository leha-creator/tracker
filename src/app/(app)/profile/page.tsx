import { ExternalLink } from 'lucide-react';
import { Suspense } from 'react';

import { SettingsSection, SettingsSections } from '@/components/layout/settings-section';
import { ProfileForm } from '@/components/profile/profile-form';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/users/user-avatar';
import { getIdpAccountUrl } from '@/modules/auth';
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
        title="Имя и фото"
        description="Берутся из plwedding ID и обновляются при входе. Видны участникам ваших пространств."
      >
        <div className="flex flex-wrap items-center gap-4">
          <UserAvatar user={profile} size="lg" />
          <span className="font-medium">{profile.name}</span>
          <Button asChild variant="outline" className="ml-auto">
            <a href={getIdpAccountUrl()} target="_blank" rel="noreferrer">
              Изменить в plwedding ID
              <ExternalLink />
            </a>
          </Button>
        </div>
      </SettingsSection>
      <SettingsSection
        title="О себе"
        description="Должность и описание показываются в профиле и в карточке при наведении."
      >
        <ProfileForm position={profile.position ?? ''} bio={profile.bio ?? ''} />
      </SettingsSection>
    </SettingsSections>
  );
}
