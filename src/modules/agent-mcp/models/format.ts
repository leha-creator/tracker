import type {
  TaskBranchesAndCommitsDto,
  TaskPullRequestDto,
} from '@/modules/integrations/github/client';
import type {
  SubtasksDto,
  TaskAttachmentDto,
  TaskCommentsDto,
  TaskDto,
  TaskHistoryDto,
  TaskListItemDto,
  TaskListPageDto,
  TaskPlacementDto,
} from '@/modules/tasks/client';

import type { CatalogLabel, CatalogMember, CatalogProject } from './catalog';
import { humanSize } from './upload';
import { describeActor, hasMcpScope, type McpActor } from './tool-scopes';

/**
 * Ответы инструментов — компактный Markdown: агенту его легче читать, чем JSON, а id
 * (проектов, статусов, участников) приводятся там, где они нужны для следующих вызовов.
 */

function placementText(placement: TaskPlacementDto): string {
  return `${placement.projectName}: ${placement.statusName} (${placement.statusCategory})`;
}

function placementsText(placements: readonly TaskPlacementDto[]): string {
  return placements.length ? placements.map(placementText).join('; ') : 'not on any board';
}

function dueText(dueDate: string | null, isOverdue: boolean): string | null {
  if (!dueDate) return null;
  return isOverdue ? `due ${dueDate} (overdue)` : `due ${dueDate}`;
}

function labelNames(labels: readonly { name: string }[]): string {
  return labels.map((label) => label.name).join(', ');
}

export function formatTaskLine(task: TaskListItemDto | SubtasksDto['items'][number]): string {
  const parts = [placementsText(task.placements)];
  parts.push(task.assignee ? `assignee: ${task.assignee.name}` : 'unassigned');
  if (task.priority !== 'none') parts.push(`priority: ${task.priority}`);
  const due = dueText(task.dueDate, task.isOverdue);
  if (due) parts.push(due);
  if (task.labels.length) parts.push(`labels: ${labelNames(task.labels)}`);
  if (task.parent) parts.push(`subtask of ${task.parent.key}`);
  if ('subtaskCount' in task && task.subtaskCount > 0) {
    parts.push(`${task.subtaskCount} subtasks`);
  }
  return `- **${task.key}** ${task.title} — ${parts.join(' · ')}`;
}

export function formatTaskList(page: TaskListPageDto): string {
  if (page.total === 0) return 'No tasks match the filters.';
  const header = `Tasks: ${page.total} total, page ${page.page} of ${page.pageCount} (${page.pageSize} per page).`;
  const more = page.page < page.pageCount ? `\nNext page: page=${page.page + 1}.` : '';
  return [header, '', ...page.items.map(formatTaskLine)].join('\n') + more;
}

const DATE_TIME = new Intl.DateTimeFormat('en-CA', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'UTC',
  hour12: false,
});

function at(date: Date): string {
  return `${DATE_TIME.format(date)} UTC`;
}

function attachmentLine(file: TaskAttachmentDto): string {
  const by = file.uploader ? `, by ${file.uploader.name}` : '';
  return `- ${file.fileName} (${humanSize(file.size)}, ${file.contentType}${by}) — attachmentId ${file.id}`;
}

function historyAuthor(item: TaskHistoryDto['items'][number]): string {
  const name = item.actor?.name ?? (item.source === 'github' ? 'GitHub' : 'deleted user');
  return item.via ? `${name} via ${item.via.tokenName}` : name;
}

function historyLines(history: TaskHistoryDto): string[] {
  if (history.items.length === 0) return ['_No changes._'];
  return history.items.map(
    (item) => `- ${at(item.updatedAt)} · ${historyAuthor(item)}: ${item.text}`,
  );
}

/** История изменений задачи (от новых к старым) — ответ get_task_history. */
export function formatTaskHistory(taskKey: string, history: TaskHistoryDto): string {
  const shown =
    history.total > history.items.length
      ? ` (latest ${history.items.length} of ${history.total})`
      : '';
  return [`# ${taskKey} · change history${shown}`, '', ...historyLines(history)].join('\n');
}

export interface TaskDetailsInput {
  task: TaskDto;
  url: string;
  suggestedBranch: string | null;
  subtasks: SubtasksDto;
  comments: TaskCommentsDto;
  pullRequests: TaskPullRequestDto[];
  branchesAndCommits: TaskBranchesAndCommitsDto;
  attachments: TaskAttachmentDto[];
  /** Последние изменения задачи (несколько записей). */
  history: TaskHistoryDto;
}

export function formatTaskDetails(input: TaskDetailsInput): string {
  const { task, subtasks, comments, pullRequests, branchesAndCommits } = input;
  const lines: string[] = [`# ${task.key} · ${task.title}`, '', `URL: ${input.url}`];

  if (task.archivedAt) {
    const by = task.archivedBy ? ` by ${task.archivedBy.name}` : '';
    lines.push(
      `ARCHIVED: since ${at(task.archivedAt)}${by}. Read-only — call restore_task before changing it.`,
    );
  }
  if (task.ancestors.length) {
    lines.push(`Parent chain: ${task.ancestors.map((a) => `${a.key} ${a.title}`).join(' › ')}`);
  }
  lines.push(
    `Status: ${placementsText(task.placements)}`,
    `Assignee: ${task.assignee?.name ?? 'unassigned'}`,
    `Priority: ${task.priority}`,
    `Labels: ${task.labels.length ? labelNames(task.labels) : 'none'}`,
    `Due: ${task.dueDate ? `${task.dueDate}${task.isOverdue ? ' (overdue)' : ''}` : 'none'}`,
    `Created: ${at(task.createdAt)} by ${task.createdBy?.name ?? 'unknown'}; updated ${at(task.updatedAt)}`,
  );
  if (input.suggestedBranch) lines.push(`Suggested branch: \`${input.suggestedBranch}\``);

  lines.push('', '## Description', task.description?.trim() || '_No description._');

  lines.push('', `## Subtasks (${subtasks.progress.done}/${subtasks.progress.total} done)`);
  if (subtasks.items.length === 0) lines.push('_No subtasks._');
  else lines.push(...subtasks.items.map(formatTaskLine));
  if (task.descendantCount > subtasks.items.length) {
    lines.push(`(${task.descendantCount} subtasks at all levels — open a subtask to see its own.)`);
  }

  lines.push('', '## GitHub');
  if (
    pullRequests.length === 0 &&
    branchesAndCommits.branches.length === 0 &&
    branchesAndCommits.commitsTotal === 0
  ) {
    lines.push('_No linked pull requests, branches or commits._');
  }
  for (const pr of pullRequests) {
    const review = pr.reviewState === 'none' ? '' : `, review: ${pr.reviewState}`;
    const checks = pr.checksState === 'none' ? '' : `, CI: ${pr.checksState}`;
    lines.push(
      `- PR ${pr.repositoryFullName}#${pr.number} [${pr.state}${review}${checks}] ${pr.title} — ${pr.url}`,
    );
  }
  for (const branch of branchesAndCommits.branches) {
    lines.push(
      `- Branch ${branch.repositoryFullName}:${branch.name}${branch.deleted ? ' (deleted)' : ''}`,
    );
  }
  for (const commit of branchesAndCommits.commits) {
    lines.push(
      `- Commit ${commit.sha.slice(0, 7)} ${commit.message} (${commit.repositoryFullName})`,
    );
  }
  if (branchesAndCommits.commitsTotal > branchesAndCommits.commits.length) {
    lines.push(`(${branchesAndCommits.commitsTotal} commits in total)`);
  }

  lines.push('', `## Attachments (${input.attachments.length})`);
  if (input.attachments.length === 0) lines.push('_No files._');
  else lines.push(...input.attachments.map(attachmentLine));
  lines.push('_Download with get_attachment_url(attachmentId)._');

  lines.push('', `## Recent changes (${input.history.total})`, ...historyLines(input.history));
  if (input.history.total > input.history.items.length) {
    lines.push('_Full history: get_task_history._');
  }

  lines.push('', `## Comments (${comments.total})`);
  if (comments.items.length === 0) lines.push('_No comments._');
  if (comments.truncated) lines.push(`_Showing the latest ${comments.items.length}._`);
  for (const comment of comments.items) {
    lines.push(
      '',
      `**${comment.author?.name ?? 'deleted user'}** · ${at(comment.createdAt)}`,
      comment.body || '_(attachments only)_',
      ...comment.attachments.map(attachmentLine),
    );
  }
  return lines.join('\n');
}

export interface WorkspaceContextInput {
  workspace: { name: string; slug: string; taskKey: string | null };
  url: string;
  actor: McpActor;
  projects: readonly CatalogProject[];
  members: readonly CatalogMember[];
  labels: readonly CatalogLabel[];
  githubGuide: string;
}

export function formatWorkspaceContext(input: WorkspaceContextInput): string {
  const { workspace } = input;
  const lines = [
    `# Workspace "${workspace.name}"`,
    '',
    `URL: ${input.url}`,
    `Task key: ${workspace.taskKey ?? 'none (tasks are #42, GitHub linking is off)'}`,
    `Your userId: ${input.actor.userId}`,
    describeActor(input.actor),
    '',
    '## Projects and statuses',
  ];
  if (input.projects.length === 0) lines.push('_No projects yet._');
  for (const project of input.projects) {
    lines.push(`- **${project.name}** (id ${project.id})`);
    for (const status of project.statuses) {
      lines.push(`  - ${status.name} — category ${status.category} (id ${status.id})`);
    }
  }
  lines.push(
    '',
    'Statuses can be passed by name, id or category (todo / in_progress / done).',
    '',
    '## Members',
    ...input.members.map((member) =>
      member.isAgent
        ? `- ${member.name} (agent; userId ${member.userId})`
        : `- ${member.name} <${member.email}> (userId ${member.userId})`,
    ),
    '',
    'Mention a member in a comment as @Name (exact name from this list).',
    '',
    '## Task labels',
    input.labels.length ? labelNames(input.labels) : '_No labels yet._',
    'Set labels with update_task (labels: full list of names; unknown names are created). Filter list_tasks by labels.',
    '',
    '## Documents',
    'Specs, ADRs and guides live in workspace Documents: list_documents, list_document_folders, get_document. Documents linked to a task are listed in get_task.',
    hasMcpScope(input.actor.scopes, 'documents')
      ? 'Write results as notes (create_note, linked to the task); edit notes with update_note and the version from get_document.'
      : 'This token cannot change documents.',
    '',
    input.githubGuide,
  );
  return lines.join('\n');
}
