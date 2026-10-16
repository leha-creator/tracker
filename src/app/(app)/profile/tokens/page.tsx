import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ApiTokensTable } from '@/components/profile/api-tokens/api-tokens-table';
import { CreateApiTokenDialog } from '@/components/profile/api-tokens/create-api-token-dialog';
import { listMyApiTokens } from '@/modules/api-tokens';
import { listMyWorkspaces } from '@/modules/workspaces';
import { requireUserOrRedirect } from '@/shared/access';
import { getEnv } from '@/shared/env';

export const metadata: Metadata = { title: 'Токены доступа — Tasker' };

export default function ProfileTokensPage() {
  return (
    <section aria-labelledby="api-tokens-heading" className="grid gap-3">
      <div className="grid gap-1">
        <h2 id="api-tokens-heading" className="text-lg font-semibold">
          Токены доступа
        </h2>
        <p className="text-sm text-muted-foreground">
          Токены для AI-агентов: Claude Code подключается к Tasker как MCP-сервер, смотрит и создаёт
          задачи, меняет статусы и пишет комментарии. Токен действует в одном пространстве с вашими
          правами.
        </p>
      </div>
      <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-muted" />}>
        <TokensSection />
      </Suspense>
    </section>
  );
}

async function TokensSection() {
  const session = await requireUserOrRedirect('/profile/tokens');
  const [tokens, workspaces] = await Promise.all([
    listMyApiTokens(session),
    listMyWorkspaces(session),
  ]);
  return (
    <div className="grid gap-3">
      <div>
        <CreateApiTokenDialog
          workspaces={workspaces.map(({ id, name }) => ({ id, name }))}
          baseUrl={getEnv().BETTER_AUTH_URL}
        />
      </div>
      <ApiTokensTable items={tokens} />
    </div>
  );
}
