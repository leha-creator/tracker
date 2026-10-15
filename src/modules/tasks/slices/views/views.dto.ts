import type { TaskPriority } from '../../models';
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
