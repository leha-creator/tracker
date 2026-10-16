import { describe, expect, it } from 'vitest';

import {
  buildFinishTaskPrompt,
  buildGithubGuide,
  buildServerInstructions,
  buildStartTaskPrompt,
  describeAutomations,
  type CatalogProject,
  type GithubGuideInput,
  type PromptTask,
} from '.';
import type { McpActor } from './tool-scopes';

const projects: CatalogProject[] = [
  {
    id: 'p-dev',
    name: 'Разработка',
    statuses: [
      { id: 's-todo', name: 'К выполнению', category: 'todo', position: 1 },
      { id: 's-review', name: 'Ревью', category: 'in_progress', position: 2 },
      { id: 's-done', name: 'Готово', category: 'done', position: 3 },
    ],
  },
  {
    id: 'p-ops',
    name: 'Инфраструктура',
    statuses: [{ id: 's-ops-done', name: 'Сделано', category: 'done', position: 1 }],
  },
];

function input(overrides: Partial<GithubGuideInput['github']> = {}): GithubGuideInput {
  return {
    taskKey: 'TSK',
    projects,
    github: { enabled: true, repositories: [], automations: [], ...overrides },
  };
}

const PERSONAL: McpActor = {
  name: 'Анна',
  userId: 'u-1',
  tokenName: 'Ноутбук',
  scopes: ['read', 'tasks', 'documents'],
  agent: null,
};

describe('buildServerInstructions', () => {
  it('говорит, от чьего имени действует агент, и перечисляет области', () => {
    const agent = buildServerInstructions({
      workspaceName: 'Команда',
      taskKey: 'TSK',
      actor: {
        ...PERSONAL,
        name: 'Claude — backend',
        scopes: ['read'],
        agent: { responsibleName: 'Анна' },
      },
    });
    expect(agent).toContain('You act as agent "Claude — backend" (responsible: Анна)');
    expect(agent).toContain('Token scopes: read.');
    expect(agent).toContain('You cannot change tasks');
    expect(agent).not.toContain('request_attachment_upload');

    const personal = buildServerInstructions({
      workspaceName: 'Команда',
      taskKey: 'TSK',
      actor: PERSONAL,
    });
    expect(personal).toContain('You act as Анна via personal token "Ноутбук"');
    expect(personal).toContain('Token scopes: read, tasks, documents.');
    expect(personal).not.toContain('You cannot change');
  });

  it('с ключом — правила ветки, коммитов и PR', () => {
    const text = buildServerInstructions({
      workspaceName: 'Команда',
      taskKey: 'TSK',
      actor: PERSONAL,
    });
    expect(text).toContain('TSK-42');
    expect(text).toContain('tsk-42-short-slug');
    expect(text).toContain('get_github_conventions');
  });

  it('без ключа — предупреждение', () => {
    expect(
      buildServerInstructions({ workspaceName: 'Команда', taskKey: null, actor: PERSONAL }),
    ).toContain('no task key');
  });
});

describe('buildGithubGuide', () => {
  it('GitHub не настроен: ключи ставить, но привязки не будет', () => {
    const guide = buildGithubGuide(input({ enabled: false }));
    expect(guide).toContain('**not set up**');
    expect(guide).toContain('TSK-042');
    expect(guide).toContain('No project moves tasks automatically');
  });

  it('без автоматизации: репозитории перечислены, статусы ставит агент', () => {
    const guide = buildGithubGuide(
      input({
        repositories: [
          { fullName: 'acme/api', suspended: false },
          { fullName: 'acme/web', suspended: true },
        ],
      }),
    );
    expect(guide).toContain('- acme/api');
    expect(guide).toContain('- acme/web — installation suspended');
    expect(guide).toContain('Set statuses yourself');
  });

  it('с автоматизацией в двух проектах: агент не двигает статус вручную', () => {
    const guide = buildGithubGuide(
      input({
        repositories: [{ fullName: 'acme/api', suspended: false }],
        automations: [
          { projectId: 'p-dev', prOpenedStatusId: 's-review', prMergedStatusId: 's-done' },
          { projectId: 'p-ops', prOpenedStatusId: null, prMergedStatusId: 's-ops-done' },
        ],
      }),
    );
    expect(guide).toContain('- Разработка: PR opened → Ревью; PR merged → Готово');
    expect(guide).toContain('- Инфраструктура: PR opened → no change; PR merged → Сделано');
    expect(guide).toContain('Do not set those statuses manually');
  });

  it('без ключа пространства — только предупреждение', () => {
    const guide = buildGithubGuide({ ...input(), taskKey: null });
    expect(guide).toContain('**no task key**');
    expect(guide).not.toContain('## Repositories');
  });

  it('describeAutomations пропускает удалённые проекты и пустые настройки', () => {
    expect(
      describeAutomations(
        input({
          automations: [
            { projectId: 'p-gone', prOpenedStatusId: 's-x', prMergedStatusId: null },
            { projectId: 'p-dev', prOpenedStatusId: 's-deleted', prMergedStatusId: null },
          ],
        }),
      ),
    ).toEqual([]);
  });
});

describe('промпты start_task / finish_task', () => {
  const task: PromptTask = {
    key: 'TSK-42',
    title: 'Починить вход',
    description: null,
    url: 'http://localhost:3000/w/team/tasks/42',
    placements: [{ project: 'Разработка', status: 'К выполнению', category: 'todo' }],
    ancestors: [{ key: 'TSK-40', title: 'Авторизация' }],
    subtasks: { done: 1, total: 3 },
    branch: 'tsk-42-pochinit-vhod',
  };
  const automation = [{ project: 'Разработка', prOpened: 'Ревью', prMerged: 'Готово' }];

  it('start_task без автоматизации: ставим in_progress, ветка и ключ в коммитах', () => {
    const text = buildStartTaskPrompt(task, []);
    expect(text).toContain('set_task_status with status "in_progress" (project: Разработка)');
    expect(text).toContain('git switch -c tsk-42-pochinit-vhod');
    expect(text).toContain('"TSK-42: "');
    expect(text).toContain('Parent chain: TSK-40 Авторизация');
    expect(text).toContain('Subtasks: 1/3 done');
  });

  it('start_task с автоматизацией: статус не трогать', () => {
    const text = buildStartTaskPrompt(task, automation);
    expect(text).toContain('Do not change the status by hand');
    expect(text).not.toContain('set_task_status with status "in_progress"');
  });

  it('start_task: задача уже в работе — статус не менять', () => {
    const inProgress = {
      ...task,
      placements: [{ project: 'Разработка', status: 'В работе', category: 'in_progress' }],
    };
    expect(buildStartTaskPrompt(inProgress, [])).toContain('already past "todo"');
  });

  it('finish_task: PR с ключом, без чужих ключей; статус по автоматизации', () => {
    const manual = buildFinishTaskPrompt(task, []);
    expect(manual).toContain('gh pr create --title "TSK-42: <summary>"');
    expect(manual).toContain('including the parent task');
    expect(manual).toContain('status "done"');

    const automated = buildFinishTaskPrompt(task, automation);
    expect(automated).toContain('Leave the status to Tasker');
    expect(automated).toContain('Разработка → Готово');
  });

  it('start_task: прочитать связанные документы', () => {
    const withDocs = { ...task, documents: [{ id: 'doc-1', title: 'Спецификация входа' }] };
    expect(buildStartTaskPrompt(withDocs, [])).toContain(
      'Read the linked documents with get_document before coding: «Спецификация входа» (doc-1)',
    );
    expect(buildStartTaskPrompt(task, [])).toContain('list_documents');
  });

  it('finish_task: заметка в документах — только с областью documents', () => {
    expect(buildFinishTaskPrompt(task, [], { canEditDocuments: true })).toContain(
      'create_note linked to TSK-42',
    );
    expect(buildFinishTaskPrompt(task, [])).not.toContain('create_note');
  });

  it('инструкции без области documents не предлагают менять документы', () => {
    const readTasks = buildServerInstructions({
      workspaceName: 'Команда',
      taskKey: 'TSK',
      actor: { ...PERSONAL, scopes: ['read', 'tasks'] },
    });
    expect(readTasks).toContain('get_document');
    expect(readTasks).not.toContain('create_note');
    expect(
      buildServerInstructions({ workspaceName: 'Команда', taskKey: 'TSK', actor: PERSONAL }),
    ).toContain('create_note');
  });

  it('без ключа пространства — без ветки и без требований к ключу', () => {
    const noKey = { ...task, key: '#42', branch: null };
    expect(buildStartTaskPrompt(noKey, [])).toContain('no task key');
    expect(buildFinishTaskPrompt(noKey, [])).toContain('will not be linked automatically');
  });
});
