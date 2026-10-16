// Публичный API модуля для серверного кода (страницы, Route Handlers).
// Клиентским компонентам — './client' (без server-only кода).
// Зависимости: integrations/github → tasks, projects, workspaces, notifications (через их index.ts);
// ядро о GitHub не знает — данные GitHub собирают страницы и компоненты.
export * from './client';

export { isGithubEnabled } from './github-api';
export {
  findUsersByGithubIds,
  getGithubIdentity,
  getMyGithubAccount,
} from './slices/identity/identity.service';
export { setupCallbackSchema } from './slices/installation/installation.schema';
export {
  completeInstallation,
  getGithubSettings,
  INVALID_INSTALL_STATE,
} from './slices/installation/installation.service';
export { peekInstallStateSlug } from './slices/installation/install-state';
export { handleGithubWebhook } from './slices/webhook/webhook.service';
export type { WebhookResult } from './slices/webhook/webhook.service';
export { verifyGithubWebhookSignature } from './slices/webhook/webhook.signature';
export {
  getPullRequestBadges,
  listTaskPullRequests,
} from './slices/pull-request/pull-request.service';
export { listTaskBranchesAndCommits } from './slices/link/link.service';
export { getProjectAutomation } from './slices/automation/automation.service';
export type { ProjectAutomationDto } from './slices/automation/automation.service';
export { manifestCallbackSchema } from './slices/app-setup/app-setup.schema';
export {
  completeGithubAppManifest,
  getGithubAppSetup,
  INVALID_MANIFEST_STATE,
} from './slices/app-setup/app-setup.service';
