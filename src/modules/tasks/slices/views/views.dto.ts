import type { TaskPriority } from '../../models';
import type { SubtaskProgress } from '../../models/task-tree';
import type { TaskLabelRefDto } from '../label/label.dto';
import type { TaskAncestorDto } from '../subtask/subtask.dto';
import type { TaskListItemDto, TaskUserDto } from '../task/task.dto';

/** Карточка задачи на доске проекта. */
export interface BoardCardDto {
  taskId: string;
  number: number;
  key: string;
  title: string;
  priority: TaskPriority;
  dueDate: string | null;
  /** Срок прошёл, а статус в этом проекте — не «Готово». */
  isOverdue: boolean;
  assignee: TaskUserDto | null;
  /** Родитель подзадачи — метка «↳ TSK-12» над названием. */
  parent: TaskAncestorDto | null;
  /** Прогресс подзадач; null — подзадач нет. */
  subtaskProgress: SubtaskProgress | null;
  /** Метки по имени (карточка показывает первые `TASK_LABELS_ON_CARD`). */
  labels: TaskLabelRefDto[];
}

/** Карточки доски по id статуса (колонки); порядок — по позиции. */
export type BoardCardsDto = Record<string, BoardCardDto[]>;

/** Страница списка задач (пространства или проекта). */
export interface TaskListPageDto {
  items: TaskListItemDto[];
  /** Всего задач по фильтру. */
  total: number;
  /** Фактический номер страницы (запрошенный за пределами — последняя). */
  page: number;
  pageCount: number;
  pageSize: number;
}

/** Задачи участника в пространстве — для публичного профиля. */
export interface MemberTaskSummaryDto {
  /** Открытые задачи, где он ответственный. */
  openCount: number;
  /** Из них просроченные. */
  overdueCount: number;
  /** Выполненные за последние `MEMBER_DONE_RECENT_DAYS` дней (по времени изменения). */
  doneRecentlyCount: number;
  /** Созданные им задачи. */
  createdCount: number;
  /** Его комментарии. */
  commentsCount: number;
  /** Последний комментарий или созданная задача; null — активности нет. */
  lastActivityAt: Date | null;
  /** Ближайшие открытые задачи: сначала с ранним сроком, без срока — в конце. */
  openTasks: TaskListItemDto[];
}

/** Задача кратко — для ссылок из других модулей (документы). */
export interface TaskSummaryDto {
  id: string;
  number: number;
  /** `#42` */
  key: string;
  title: string;
  /** Во всех проектах задачи статус «Готово». */
  isDone: boolean;
}
