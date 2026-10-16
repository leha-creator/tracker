import type { ProjectAutomationView } from './github-guide';

/** Данные задачи для сценариев start_task / finish_task. */
export interface PromptTask {
  key: string;
  title: string;
  description: string | null;
  url: string;
  /** `Проект: Статус (категория)`. */
  placements: { project: string; status: string; category: string }[];
  ancestors: { key: string; title: string }[];
  subtasks: { done: number; total: number };
  branch: string | null;
  /** Документы, связанные с задачей (спецификации, ADR). */
  documents?: { id: string; title: string }[];
}

/** Что токен разрешает в сценарии: изменение документов — отдельная область. */
export interface PromptOptions {
  canEditDocuments?: boolean;
}

/** Автосмена статуса в проектах, где лежит задача (только они важны для сценария). */
function taskAutomations(
  task: PromptTask,
  automations: readonly ProjectAutomationView[],
): ProjectAutomationView[] {
  const projects = new Set(task.placements.map((placement) => placement.project));
  return automations.filter((automation) => projects.has(automation.project));
}

function taskHeader(task: PromptTask): string[] {
  const lines = [`Task ${task.key}: ${task.title}`, `URL: ${task.url}`];
  if (task.ancestors.length) {
    lines.push(`Parent chain: ${task.ancestors.map((a) => `${a.key} ${a.title}`).join(' › ')}`);
  }
  lines.push(
    `Status: ${
      task.placements.map((p) => `${p.project}: ${p.status} (${p.category})`).join('; ') ||
      'not on any board'
    }`,
  );
  if (task.subtasks.total) {
    lines.push(`Subtasks: ${task.subtasks.done}/${task.subtasks.total} done`);
  }
  lines.push('', 'Description:', task.description?.trim() || '(none)');
  return lines;
}

function readDocumentsStep(task: PromptTask): string {
  const documents = task.documents ?? [];
  if (documents.length === 0) {
    return 'Check workspace Documents for a spec or decisions on this topic (list_documents with query) — none are linked to the task yet.';
  }
  return `Read the linked documents with get_document before coding: ${documents
    .map((document) => `«${document.title}» (${document.id})`)
    .join(', ')}.`;
}

export function buildStartTaskPrompt(
  task: PromptTask,
  automations: readonly ProjectAutomationView[],
): string {
  const automated = taskAutomations(task, automations);
  const keyRef = task.key.startsWith('#') ? null : task.key;
  const todoPlacements = task.placements.filter((placement) => placement.category === 'todo');
  let statusStep: string;
  if (automated.some((item) => item.prOpened)) {
    statusStep = `Do not change the status by hand: when you open the PR Tasker moves it automatically (${automated
      .filter((item) => item.prOpened)
      .map((item) => `${item.project} → ${item.prOpened}`)
      .join('; ')}).`;
  } else if (task.placements.length === 0) {
    statusStep =
      'The task is not on any board. If it should be tracked on a board, call set_task_status with a project and status "in_progress".';
  } else if (todoPlacements.length === 0) {
    statusStep = 'The task is already past "todo" — keep its status as is.';
  } else {
    statusStep = `Call set_task_status with status "in_progress" (project: ${todoPlacements
      .map((placement) => placement.project)
      .join(', ')}).`;
  }

  const steps = [
    `Call get_task for ${task.key} to read the full description, comments, linked documents and existing GitHub links.`,
    readDocumentsStep(task),
    'If the task is large, split it into subtasks with create_task (parent: the task) and work on them one by one, each in its own branch.',
    statusStep,
    task.branch
      ? `Create the branch: \`git switch -c ${task.branch}\` (check it with preview_github_links first).`
      : 'This workspace has no task key — use any branch name; linking to GitHub will not work.',
    keyRef
      ? `Start every commit message with "${keyRef}: ". Do not mention other task keys.`
      : 'Commit as usual.',
    'Post short add_comment notes about important decisions, blockers or questions for the team.',
  ];

  return [
    'Start working on this Tasker task.',
    '',
    ...taskHeader(task),
    '',
    'Steps:',
    ...steps.map((step, index) => `${index + 1}. ${step}`),
  ].join('\n');
}

export function buildFinishTaskPrompt(
  task: PromptTask,
  automations: readonly ProjectAutomationView[],
  options: PromptOptions = {},
): string {
  const automated = taskAutomations(task, automations);
  const keyRef = task.key.startsWith('#') ? null : task.key;
  const merged = automated.filter((item) => item.prMerged);
  const statusStep = merged.length
    ? `Leave the status to Tasker: when the PR is merged it moves the task (${merged
        .map((item) => `${item.project} → ${item.prMerged}`)
        .join('; ')}). Do not set it by hand.`
    : 'No automation moves this task on merge. If the work is complete and merged (or nothing needs review), call set_task_status with status "done"; if it waits for review, leave it in progress and say so in the comment.';

  const steps = [
    'Make sure all changes are committed and pushed.',
    keyRef
      ? `Prepare the PR title "${keyRef}: <summary>" and run preview_github_links on it (and on the description) — it must link exactly ${keyRef}.`
      : 'Prepare the PR; this workspace has no task key, so it will not be linked automatically.',
    keyRef
      ? `Open the PR, e.g. \`gh pr create --title "${keyRef}: <summary>" --body "<what and why>"\`. Do not mention other task keys (including the parent task) in the title or body.`
      : 'Open the PR.',
    `add_comment on ${task.key}: what was done, what is left, and the PR link.`,
    options.canEditDocuments
      ? `If the work produced decisions or instructions worth keeping (ADR, how-to, implementation notes), save them as a note with create_note linked to ${task.key} (tasks: ["${task.key}"]); to change an existing note, use update_note with the version from get_document.`
      : null,
    statusStep,
  ].filter((step): step is string => step !== null);

  return [
    'Finish the work on this Tasker task.',
    '',
    ...taskHeader(task),
    task.branch ? `Expected branch: ${task.branch}` : '',
    '',
    'Steps:',
    ...steps.map((step, index) => `${index + 1}. ${step}`),
  ].join('\n');
}
