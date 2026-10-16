/**
 * Публичный API модуля для клиентских компонентов: Server Actions, схемы, чистые функции и типы.
 * Без server-only кода (сервисов, репозиториев, клиента GitHub API) — их экспортирует только index.ts.
 */
export {
  linkGithubAccountAction,
  unlinkGithubAccountAction,
} from './slices/identity/identity.actions';
export type { MyGithubAccountDto } from './slices/identity/identity.dto';
export {
  connectInstallationAction,
  disconnectInstallationAction,
  setRepositoryEnabledAction,
  startInstallationAction,
} from './slices/installation/installation.actions';
export type {
  AvailableInstallationDto,
  GithubInstallationDto,
  GithubRepositoryDto,
  GithubSettingsDto,
} from './slices/installation/installation.dto';
export type {
  PullRequestBadgeDto,
  PullRequestBadgesDto,
  TaskPullRequestDto,
} from './slices/pull-request/pull-request.dto';
export type { ChecksState, PullRequestState, ReviewState } from './models';
export type {
  TaskBranchDto,
  TaskBranchesAndCommitsDto,
  TaskCommitDto,
} from './slices/link/link.dto';
export { dismissPullRequestAction, linkPullRequestByUrlAction } from './slices/link/link.actions';
export { suggestBranchName } from './models';
export { updateProjectAutomationAction } from './slices/automation/automation.actions';
export { KEEP_STATUS } from './slices/automation/automation.schema';
