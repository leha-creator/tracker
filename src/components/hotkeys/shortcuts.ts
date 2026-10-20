import { formatShortcut } from '@/lib/hotkeys';

/** Каталог горячих клавиш: одна запись — для обработчика, справки и подсказок у кнопок. */
export const SHORTCUTS = {
  help: { keys: 'shift+/', label: 'Горячие клавиши', group: 'Общие' },
  search: { keys: 'mod+k', label: 'Поиск и команды', group: 'Общие' },
  newTask: { keys: 'c', label: 'Новая задача', group: 'Общие' },
  focusSearch: { keys: '/', label: 'Поиск в списке задач', group: 'Общие' },
  goOverview: { keys: 'g o', label: 'Обзор пространства', group: 'Переходы' },
  goProjects: { keys: 'g p', label: 'Проекты', group: 'Переходы' },
  goTasks: { keys: 'g t', label: 'Задачи', group: 'Переходы' },
  goDocs: { keys: 'g d', label: 'Документы', group: 'Переходы' },
  goMyTasks: { keys: 'g m', label: 'Мои задачи', group: 'Переходы' },
  goHelp: { keys: 'g h', label: 'Справка', group: 'Переходы' },
  boardMove: {
    keys: 'up down left right',
    label: 'Карточка выше, ниже, соседняя колонка',
    group: 'Доска',
  },
  boardOpen: { keys: 'enter', label: 'Открыть задачу', group: 'Доска' },
  boardDrag: { keys: 'space', label: 'Взять и положить карточку', group: 'Доска' },
  nextTask: { keys: 'j', label: 'Следующая задача', group: 'Панель задачи' },
  prevTask: { keys: 'k', label: 'Предыдущая задача', group: 'Панель задачи' },
  assignMe: { keys: 'i', label: 'Назначить на себя', group: 'Панель задачи' },
  fieldStatus: { keys: 's', label: 'Статус', group: 'Панель задачи' },
  fieldPriority: { keys: 'p', label: 'Приоритет', group: 'Панель задачи' },
  fieldDue: { keys: 'd', label: 'Срок', group: 'Панель задачи' },
  fieldLabels: { keys: 'l', label: 'Метки', group: 'Панель задачи' },
  fieldAssignee: { keys: 'a', label: 'Ответственный', group: 'Панель задачи' },
  watch: { keys: 'w', label: 'Следить / не следить', group: 'Панель задачи' },
  closePanel: { keys: 'escape', label: 'Закрыть панель', group: 'Панель задачи' },
} as const satisfies Record<string, { keys: string; label: string; group: string }>;

export type ShortcutId = keyof typeof SHORTCUTS;

/** Подпись клавиш для подсказки: «Статус (S)». */
export function shortcutHint(id: ShortcutId): string {
  return formatShortcut(SHORTCUTS[id].keys);
}

/** Группы для справки в порядке каталога. */
export function shortcutGroups(): {
  group: string;
  items: { id: ShortcutId; label: string; keys: string[] }[];
}[] {
  const groups = new Map<string, { id: ShortcutId; label: string; keys: string[] }[]>();
  for (const [id, shortcut] of Object.entries(SHORTCUTS) as [
    ShortcutId,
    (typeof SHORTCUTS)[ShortcutId],
  ][]) {
    const items = groups.get(shortcut.group) ?? [];
    // Перечисление через пробел у стрелок — отдельные клавиши, у «g t» — последовательность.
    const keys =
      id === 'boardMove'
        ? shortcut.keys.split(' ').map(formatShortcut)
        : [formatShortcut(shortcut.keys)];
    items.push({ id, label: shortcut.label, keys });
    groups.set(shortcut.group, items);
  }
  return [...groups].map(([group, items]) => ({ group, items }));
}
