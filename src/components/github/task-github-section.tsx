import { GitBranch, GitCommitHorizontal } from 'lucide-react';

import { CopyLinkButton } from '@/components/workspaces/copy-link-button';
import {
  isGithubEnabled,
  listTaskBranchesAndCommits,
  listTaskPullRequests,
} from '@/modules/integrations/github';
import { suggestBranchName } from '@/modules/integrations/github/client';
import type { AuthSession } from '@/shared/auth';

import { ChecksIndicator, PrStateBadge, ReviewBadge } from './pr-state';
import { DismissPullRequestButton, LinkPullRequestForm } from './task-github-actions';

const DATE_TIME = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' });

interface TaskGithubSectionProps {
  session: AuthSession;
  workspace: { id: string };
  task: { id: string; key: string; title: string };
}

/**
 * Раздел «GitHub» задачи: PR, ветки и последние коммиты. Пусто — подсказка с именем ветки.
 * Без настроенного GitHub App раздела нет. Тексты из GitHub выводятся только как текст.
 */
export async function TaskGithubSection({ session, workspace, task }: TaskGithubSectionProps) {
  if (!isGithubEnabled()) return null;
  const [pullRequests, { branches, commits, commitsTotal }] = await Promise.all([
    listTaskPullRequests(session, workspace.id, task.id),
    listTaskBranchesAndCommits(session, workspace.id, task.id),
  ]);
  const empty = pullRequests.length === 0 && branches.length === 0 && commits.length === 0;
  // Без ключа пространства ключ задачи — `#42`: по нему ничего не привяжется.
  const branchName = task.key.startsWith('#') ? null : suggestBranchName(task.key, task.title);

  return (
    <section aria-labelledby="task-github-heading" className="grid gap-3">
      <h3 id="task-github-heading" className="text-sm font-semibold">
        GitHub
      </h3>

      {empty && (
        <div className="grid gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          {branchName ? (
            <>
              <p>
                Добавьте <code className="font-mono text-foreground">{task.key}</code> в название
                ветки, PR или текст коммита — они появятся здесь.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                  {branchName}
                </code>
                <CopyLinkButton url={branchName} label="Скопировать имя ветки" />
              </div>
            </>
          ) : (
            <p>У пространства нет ключа задач — владелец может задать его в настройках.</p>
          )}
        </div>
      )}

      {pullRequests.length > 0 && (
        <ul className="grid gap-2" aria-label="Pull requests">
          {pullRequests.map((pr) => {
            const name = `${pr.repositoryFullName}#${pr.number}`;
            return (
              <li key={pr.id} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                <div className="grid min-w-0 flex-1 gap-1">
                  <a
                    href={pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="line-clamp-2 font-medium break-words hover:underline"
                  >
                    {pr.title}
                  </a>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-mono">{name}</span>
                    <PrStateBadge state={pr.state} />
                    <ReviewBadge state={pr.reviewState} />
                    <ChecksIndicator state={pr.checksState} />
                    {pr.authorLogin && <span>@{pr.authorLogin}</span>}
                  </p>
                </div>
                <DismissPullRequestButton
                  workspaceId={workspace.id}
                  taskId={task.id}
                  pullRequestId={pr.id}
                  label={name}
                />
              </li>
            );
          })}
        </ul>
      )}

      {branches.length > 0 && (
        <ul className="grid gap-1 text-sm" aria-label="Ветки">
          {branches.map((branch) => (
            <li
              key={`${branch.repositoryFullName}:${branch.name}`}
              className="flex min-w-0 items-center gap-2"
            >
              <GitBranch aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span
                className={
                  branch.deleted
                    ? 'truncate font-mono text-muted-foreground line-through'
                    : 'truncate font-mono'
                }
              >
                {branch.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {branch.repositoryFullName}
                {branch.deleted && ' · удалена'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {commits.length > 0 && (
        <div className="grid gap-1">
          <ul className="grid gap-1 text-sm" aria-label="Коммиты">
            {commits.map((commit) => (
              <li
                key={`${commit.repositoryFullName}:${commit.sha}`}
                className="flex min-w-0 items-center gap-2"
              >
                <GitCommitHorizontal
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <a
                  href={commit.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 font-mono text-xs text-primary hover:underline"
                >
                  {commit.sha.slice(0, 7)}
                </a>
                <span className="min-w-0 flex-1 truncate">{commit.message}</span>
                <span className="hidden shrink-0 text-xs text-muted-foreground @md:inline">
                  {[commit.authorLogin, DATE_TIME.format(commit.committedAt)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
          {commitsTotal > commits.length && (
            <p className="text-xs text-muted-foreground">и ещё {commitsTotal - commits.length}</p>
          )}
        </div>
      )}

      <LinkPullRequestForm workspaceId={workspace.id} taskId={task.id} />
    </section>
  );
}
