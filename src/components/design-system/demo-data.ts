import type { BoardCardDto } from '@/modules/tasks/client';

/** Демо-данные страницы /admin/design: без запросов к БД. */
export const DEMO_CARDS: BoardCardDto[] = [
  {
    taskId: 'demo-1',
    number: 42,
    key: 'TSK-42',
    title: 'Сверстать главную страницу по макету',
    priority: 'high',
    dueDate: null,
    isOverdue: false,
    assignee: null,
    parent: null,
    subtaskProgress: { total: 4, done: 1 },
    labels: [
      { id: 'l1', name: 'Фронтенд', color: 'blue' },
      { id: 'l2', name: 'Срочно', color: 'red' },
    ],
  },
  {
    taskId: 'demo-2',
    number: 43,
    key: 'TSK-43',
    title: 'Подготовить тексты для раздела «О нас»',
    priority: 'medium',
    dueDate: null,
    isOverdue: false,
    assignee: null,
    parent: { number: 42, key: 'TSK-42', title: 'Сверстать главную страницу по макету' },
    subtaskProgress: null,
    labels: [],
  },
];

export const DEMO_USERS = [
  { name: 'Анна Смирнова', image: null },
  { name: 'Борис Ким', image: null },
  { name: 'Claude Code', image: '/agent-avatar.svg' },
] as const;
