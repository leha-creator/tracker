import { Suspense } from 'react';

import { ProfileAvatarForm } from '@/components/profile/profile-avatar-form';
import { ProfileForm } from '@/components/profile/profile-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getMyProfile } from '@/modules/profiles';
import { requireUserOrRedirect } from '@/shared/access';

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <ProfileSection />
    </Suspense>
  );
}

async function ProfileSection() {
  const session = await requireUserOrRedirect('/profile');
  const profile = await getMyProfile(session);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Фото</CardTitle>
          <CardDescription>
            Видно участникам ваших пространств. PNG, JPEG или WebP до 2 МБ.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileAvatarForm name={profile.name} image={profile.image} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>О себе</CardTitle>
          <CardDescription>
            Имя, должность и описание показываются в профиле и в карточке при наведении.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            name={profile.name}
            position={profile.position ?? ''}
            bio={profile.bio ?? ''}
          />
        </CardContent>
      </Card>
    </div>
  );
}
