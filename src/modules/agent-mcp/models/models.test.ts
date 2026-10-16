import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/shared/errors';

import {
  normalizeName,
  parseStatusCategory,
  parseTaskRef,
  resolveMember,
  resolveProject,
  resolveStatus,
  taskKeyOf,
  taskUrl,
  type CatalogProject,
} from '.';

const project: CatalogProject = {
  id: 'p-1',
  name: 'Разработка',
  statuses: [
    { id: 's-done', name: 'Готово', category: 'done', position: 3 },
    { id: 's-todo', name: 'К выполнению', category: 'todo', position: 1 },
    { id: 's-review', name: 'Ревью', category: 'in_progress', position: 2.5 },
    { id: 's-work', name: 'В работе', category: 'in_progress', position: 2 },
  ],
};

describe('parseTaskRef', () => {
  it('принимает ключ пространства без учёта регистра, #номер и число', () => {
    expect(parseTaskRef('TSK-42', 'TSK')).toBe(42);
    expect(parseTaskRef('tsk-42', 'TSK')).toBe(42);
    expect(parseTaskRef(' #7 ', 'TSK')).toBe(7);
    expect(parseTaskRef('15', null)).toBe(15);
    expect(parseTaskRef(3, 'TSK')).toBe(3);
  });

  it('отклоняет чужой ключ с подсказкой правильного', () => {
    expect(() => parseTaskRef('ABC-1', 'TSK')).toThrow(/ключ задач этого пространства — TSK/);
    expect(() => parseTaskRef('ABC-1', null)).toThrow(/нет ключа задач/);
  });

  it('отклоняет мусор, ноль и ведущие нули', () => {
    for (const value of ['', 'TSK', 'TSK-0', 'TSK-012', 'TSK-1a', '-1', 'TSK 1']) {
      expect(() => parseTaskRef(value, 'TSK')).toThrow(ValidationError);
    }
  });
});

describe('taskKeyOf / taskUrl', () => {
  it('ключ как в интерфейсе', () => {
    expect(taskKeyOf(42, 'TSK')).toBe('TSK-42');
    expect(taskKeyOf(42, null)).toBe('#42');
  });

  it('ссылка на страницу задачи', () => {
    expect(taskUrl('https://t.example/', 'team', 5)).toBe('https://t.example/w/team/tasks/5');
  });
});

describe('normalizeName / parseStatusCategory', () => {
  it('без регистра, пробелов и «ё»', () => {
    expect(normalizeName('  Ещё   Одна ')).toBe('еще одна');
  });

  it('распознаёт категории и их написания', () => {
    expect(parseStatusCategory('In Progress')).toBe('in_progress');
    expect(parseStatusCategory('in-progress')).toBe('in_progress');
    expect(parseStatusCategory('DONE')).toBe('done');
    expect(parseStatusCategory('Готово')).toBeNull();
  });
});

describe('resolveProject', () => {
  const projects = [project, { id: 'p-2', name: 'Дизайн', statuses: [] }];

  it('по id и по имени без учёта регистра', () => {
    expect(resolveProject(projects, 'p-2').name).toBe('Дизайн');
    expect(resolveProject(projects, 'разработка').id).toBe('p-1');
  });

  it('не найден — ошибка со списком проектов', () => {
    expect(() => resolveProject(projects, 'Маркетинг')).toThrow(/«Разработка», «Дизайн»/);
  });

  it('одинаковые имена — просим id', () => {
    const twins = [project, { ...project, id: 'p-3' }];
    expect(() => resolveProject(twins, 'Разработка')).toThrow(/неоднозначен/);
  });
});

describe('resolveStatus', () => {
  it('по имени и id', () => {
    expect(resolveStatus(project, 'ревью').id).toBe('s-review');
    expect(resolveStatus(project, 's-done').id).toBe('s-done');
  });

  it('категория → первый по порядку статус этой категории', () => {
    expect(resolveStatus(project, 'in_progress').id).toBe('s-work');
    expect(resolveStatus(project, 'todo').id).toBe('s-todo');
  });

  it('статус с именем, совпадающим с категорией, важнее категории', () => {
    const named: CatalogProject = {
      ...project,
      statuses: [...project.statuses, { id: 's-x', name: 'done', category: 'todo', position: 9 }],
    };
    expect(resolveStatus(named, 'done').id).toBe('s-x');
  });

  it('нет статусов категории — ошибка со списком', () => {
    const noDone = { ...project, statuses: project.statuses.filter((s) => s.category !== 'done') };
    expect(() => resolveStatus(noDone, 'done')).toThrow(/нет статусов категории done/);
  });

  it('неизвестный статус — ошибка со статусами и категориями', () => {
    expect(() => resolveStatus(project, 'QA')).toThrow(/todo, in_progress, done\): .*«Готово»/);
  });
});

describe('resolveMember', () => {
  const members = [
    { userId: 'u-1', name: 'Анна Петрова', email: 'anna@example.com' },
    { userId: 'u-2', name: 'Борис', email: 'boris@example.com' },
    { userId: 'u-3', name: 'Борис', email: 'boris2@example.com' },
  ];

  it('me, id, email и уникальное имя', () => {
    expect(resolveMember(members, 'me', 'u-1').userId).toBe('u-1');
    expect(resolveMember(members, 'u-2', 'u-1').userId).toBe('u-2');
    expect(resolveMember(members, 'BORIS2@example.com', 'u-1').userId).toBe('u-3');
    expect(resolveMember(members, 'анна петрова', 'u-1').userId).toBe('u-1');
  });

  it('неоднозначное имя и неучастник — ошибки', () => {
    expect(() => resolveMember(members, 'Борис', 'u-1')).toThrow(/несколько/);
    expect(() => resolveMember(members, 'x@example.com', 'u-1')).toThrow(/не найден/);
  });
});
