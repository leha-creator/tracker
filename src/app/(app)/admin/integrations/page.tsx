import { Suspense } from 'react';

import { GithubAppSetup } from '@/components/admin/github-app-setup';
import { Skeleton } from '@/components/ui/skeleton';
import { getGithubAppSetup } from '@/modules/integrations/github';
import { requireAdminOrNotFound } from '@/shared/access';

export default function AdminIntegrationsPage({ searchParams }: PageProps<'/admin/integrations'>) {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
      <IntegrationsSection searchParams={searchParams} />
    </Suspense>
  );
}

async function IntegrationsSection({
  searchParams,
}: Pick<PageProps<'/admin/integrations'>, 'searchParams'>) {
  await requireAdminOrNotFound('/admin/integrations');
  const [setup, query] = await Promise.all([getGithubAppSetup(), searchParams]);
  return (
    <div className="grid w-full max-w-3xl gap-6">
      <GithubAppSetup
        setup={setup}
        created={query.created === '1'}
        errorCode={typeof query.error === 'string' ? query.error : undefined}
      />
    </div>
  );
}
