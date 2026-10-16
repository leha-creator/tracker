import { describeActor, hasMcpScope, type McpActor } from './tool-scopes';

import type { CatalogProject } from './catalog';

/** Что известно об интеграции пространства (сводка модуля integrations/github). */
export interface GithubGuideInput {
  taskKey: string | null;
  github: {
    enabled: boolean;
    repositories: { fullName: string; suspended: boolean }[];
    automations: {
      projectId: string;
      prOpenedStatusId: string | null;
      prMergedStatusId: string | null;
    }[];
  };
  projects: readonly CatalogProject[];
}

/** Автосмена статуса проекта в понятном виде: названия проекта и статусов. */
export interface ProjectAutomationView {
  project: string;
  prOpened: string | null;
  prMerged: string | null;
}

export function describeAutomations(input: GithubGuideInput): ProjectAutomationView[] {
  return input.github.automations.flatMap((automation) => {
    const project = input.projects.find((item) => item.id === automation.projectId);
    if (!project) return [];
    const statusName = (id: string | null) =>
      id ? (project.statuses.find((status) => status.id === id)?.name ?? null) : null;
    const view = {
      project: project.name,
      prOpened: statusName(automation.prOpenedStatusId),
      prMerged: statusName(automation.prMergedStatusId),
    };
    return view.prOpened || view.prMerged ? [view] : [];
  });
}

/**
 * Короткая выжимка для `instructions` MCP-сервера: Claude Code показывает её модели при
 * подключении. Без запросов к БД — только ключ пространства из токена.
 */
export function buildServerInstructions(input: {
  workspaceName: string;
  taskKey: string | null;
  actor: McpActor;
}): string {
  const key = input.taskKey;
  const example = key ? `${key}-42` : '#42';
  const canEditTasks = hasMcpScope(input.actor.scopes, 'tasks');
  const lines = [
    `Tasker is the task tracker for this repository (workspace "${input.workspaceName}"). Tasks are referenced as ${example}.`,
    describeActor(input.actor),
    'Start with get_workspace_context (projects, statuses, members, GitHub setup), then use get_task / list_tasks.',
  ];
  if (canEditTasks) {
    lines.push(
      'Use the tools to create tasks, change status, add comments and organise subtasks instead of keeping a separate TODO list.',
      'Attach files (logs as .txt, screenshots, reports) with request_attachment_upload + complete_attachment_upload; read files people attached with get_attachment_url.',
    );
  } else {
    lines.push('Read files people attached with get_attachment_url.');
  }
  lines.push(
    'Workspace Documents hold specs, ADRs and guides: before working on a task read the documents linked to it (get_task lists them, get_document reads them); search others with list_documents.',
  );
  if (hasMcpScope(input.actor.scopes, 'documents')) {
    lines.push(
      'Save results worth keeping (ADR, reports, implementation notes) as a note with create_note and link it to the task. Edit a note only with update_note and the current version from get_document; on a version conflict re-read and re-apply.',
    );
  }
  if (key) {
    lines.push(
      `GitHub linking is automatic by task key: put exactly one key like ${key}-42 in the branch name (${key.toLowerCase()}-42-short-slug), in every commit message ("${key}-42: what changed") and in the PR title. Never mention keys of unrelated tasks in PR titles or descriptions — each key links the PR to that task.`,
      'Call get_github_conventions before creating a branch or PR, and preview_github_links to check a branch name or PR title.',
    );
  } else {
    lines.push(
      'This workspace has no task key, so branches and PRs cannot be linked to tasks automatically — tell the user.',
    );
  }
  lines.push(
    'Write task titles, descriptions and comments in the language the existing tasks use.',
  );
  return lines.join('\n');
}

/** Полные правила привязки к GitHub для агента (инструмент get_github_conventions). */
export function buildGithubGuide(input: GithubGuideInput): string {
  const key = input.taskKey;
  const lines: string[] = ['# GitHub conventions for this workspace', ''];

  if (!key) {
    lines.push(
      'This workspace has **no task key**: branches, commits and PRs cannot be linked to tasks.',
      'Ask the workspace owner to set a task key in Tasker workspace settings.',
    );
    return lines.join('\n');
  }

  const example = `${key}-42`;
  const branchExample = `${key.toLowerCase()}-42-fix-login-redirect`;
  lines.push(
    `Task key: **${key}** (tasks are ${example}, ${key}-43, …).`,
    '',
    '## How linking works',
    `- Tasker links a branch, commit or PR to a task when its text contains the task key, e.g. \`${example}\`.`,
    `- Matching is case-insensitive and needs word boundaries: \`${branchExample}\`, \`feature/${example}-login\`, \`[${example}]\`, \`${example}: …\` all match.`,
    `- The number has no leading zeros: \`${key}-042\` does **not** match. \`${example}abc\` and \`2${example}\` do not match either.`,
    '- Sources: PR branch name, PR title and PR description link the PR; a pushed branch name links the branch and its commits; a commit message links just that commit.',
    '- Editing a PR re-evaluates links: a key removed from the text unlinks the PR.',
    '- **Every** key in the PR text is linked. Do not mention other tasks\' keys (including the parent task of a subtask) in PR titles or descriptions — write "parent task" in words or omit it.',
    '',
    '## What to do',
    `1. Branch: one task per branch, named \`<key>-<number>-<short-slug>\`, e.g. \`${branchExample}\`. get_task returns a suggested branch name.`,
    `2. Commits: start the message with the key — \`${example}: handle expired session\`.`,
    `3. PR title: \`${example}: <summary>\`. In the PR description reference only this task.`,
    '4. Before pushing or opening a PR, run preview_github_links on the branch name and the PR title — it must report exactly the intended task.',
    '5. Subtasks have their own keys. Work on a subtask in a branch with the subtask key, not the parent key.',
  );

  lines.push('', '## Repositories');
  if (!input.github.enabled) {
    lines.push(
      'The GitHub integration is **not set up** in Tasker. Still use task keys in branches and commits, but nothing will be linked automatically — tell the user.',
    );
  } else if (input.github.repositories.length === 0) {
    lines.push(
      'No repositories are connected to this workspace, so nothing will be linked. Ask the workspace owner to select the repository in Settings → GitHub.',
    );
  } else {
    lines.push(
      'Events are processed only from these repositories (others are ignored):',
      ...input.github.repositories.map(
        (repo) =>
          `- ${repo.fullName}${repo.suspended ? ' — installation suspended, links paused' : ''}`,
      ),
      'If the current repository is not listed, tell the user instead of relying on automatic linking.',
    );
  }

  lines.push('', '## Status automation');
  const automations = input.github.enabled ? describeAutomations(input) : [];
  if (automations.length === 0) {
    lines.push(
      'No project moves tasks automatically. Set statuses yourself with set_task_status: in_progress when you start, and the done category (or a review status) when the PR is merged or the work is finished.',
    );
  } else {
    lines.push(
      'These projects move tasks automatically (forward only: todo → in_progress → done):',
      ...automations.map(
        (item) =>
          `- ${item.project}: PR opened → ${item.prOpened ?? 'no change'}; PR merged → ${item.prMerged ?? 'no change'}`,
      ),
      'Do not set those statuses manually for tasks in these projects — open the PR and let Tasker move the task. In other projects set statuses yourself.',
    );
  }
  return lines.join('\n');
}
