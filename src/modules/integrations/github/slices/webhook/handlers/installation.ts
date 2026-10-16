import 'server-only';

import { createLogger } from '@/shared/logger';

import {
  installationRepository,
  type InstallationData,
  type RepositoryData,
} from '../../installation/installation.repository';
import {
  installationEventSchema,
  installationRepositoriesEventSchema,
  type InstallationEvent,
} from '../webhook.schema';
import type { WebhookHandler } from '../webhook.types';

const log = createLogger('github.webhook.installation');

function toInstallationData(installation: InstallationEvent['installation']): InstallationData {
  const account = installation.account;
  return {
    id: BigInt(installation.id),
    accountId: BigInt(account?.id ?? 0),
    accountLogin: account?.login ?? account?.slug ?? `installation-${installation.id}`,
    accountType: account?.type ?? 'Organization',
    suspendedAt: installation.suspended_at ? new Date(installation.suspended_at) : null,
  };
}

function toRepositoryData(repository: {
  id: number;
  full_name: string;
  private: boolean;
}): RepositoryData {
  return {
    id: BigInt(repository.id),
    fullName: repository.full_name,
    private: repository.private,
    defaultBranch: null,
  };
}

/**
 * `installation`: created — запоминаем установку и репозитории (к пространству не привязываем:
 * это делает Setup URL с проверкой пользователя); deleted — удаляем (каскадом всё связанное);
 * suspend / unsuspend — отметка, события приостановленной установки не обрабатываются.
 */
export const handleInstallation: WebhookHandler = async (payload, { tx }) => {
  const event = installationEventSchema.parse(payload);
  const installationId = BigInt(event.installation.id);
  switch (event.action) {
    case 'created':
    case 'new_permissions_accepted': {
      const data = toInstallationData(event.installation);
      await installationRepository.upsertInstallation(tx, data);
      if (event.repositories) {
        await installationRepository.syncRepositories(
          tx,
          installationId,
          event.repositories.map(toRepositoryData),
        );
      }
      log.info(
        { installationId: data.id.toString(), repositories: event.repositories?.length ?? null },
        '[github.installation] stored from webhook',
      );
      return 'handled';
    }
    case 'deleted': {
      const count = await installationRepository.deleteInstallation(tx, installationId);
      log.info(
        { installationId: installationId.toString(), count },
        '[github.installation] deleted',
      );
      return 'handled';
    }
    case 'suspend':
    case 'unsuspend': {
      const suspendedAt = event.action === 'suspend' ? new Date() : null;
      const count = await installationRepository.setSuspended(tx, installationId, suspendedAt);
      log.info(
        { installationId: installationId.toString(), action: event.action, count },
        '[github.installation] suspension changed',
      );
      return 'handled';
    }
    default:
      return 'ignored';
  }
};

/** `installation_repositories`: доступ приложения к репозиториям изменили на GitHub. */
export const handleInstallationRepositories: WebhookHandler = async (payload, { tx }) => {
  const event = installationRepositoriesEventSchema.parse(payload);
  if (event.action !== 'added' && event.action !== 'removed') return 'ignored';
  const installationId = BigInt(event.installation.id);
  // Событие created могло не дойти — установка создаётся здесь же.
  await installationRepository.upsertInstallation(tx, toInstallationData(event.installation));
  await installationRepository.upsertRepositories(
    tx,
    installationId,
    event.repositories_added.map(toRepositoryData),
  );
  const removed = await installationRepository.removeRepositories(
    tx,
    event.repositories_removed.map((repository) => BigInt(repository.id)),
  );
  log.info(
    {
      installationId: installationId.toString(),
      added: event.repositories_added.length,
      removed,
    },
    '[github.installation] repositories changed',
  );
  return 'handled';
};
