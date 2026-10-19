import { Suspense } from 'react';

import { OverviewTiles } from '@/components/admin/overview/overview-tiles';
import { SignupsChart } from '@/components/admin/overview/signups-chart';
import { SystemStatus } from '@/components/admin/overview/system-status';
import { getResourceOverview, SIGNUPS_PERIOD_DAYS } from '@/modules/admin';
import { requireAdminOrNotFound } from '@/shared/access';

// Без metadata.title: заголовок в статическом shell раскрыл бы раздел не-администратору.

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <OverviewContent />
    </Suspense>
  );
}

/** Обзор ресурса. Не-администратору — 404, а не редирект. */
async function OverviewContent() {
  await requireAdminOrNotFound('/admin');
  const overview = await getResourceOverview();
  return (
    <div className="grid gap-6">
      <OverviewTiles overview={overview} />
      <section className="grid gap-3 rounded-xl border bg-card p-4">
        <h2 className="text-base font-medium">
          Регистрации за {SIGNUPS_PERIOD_DAYS} дней: {overview.signupsTotal}
        </h2>
        <SignupsChart series={overview.signups} />
      </section>
      <SystemStatus overview={overview} />
    </div>
  );
}
