import type { SubtaskProgress } from '../../models/task-tree';
import type { TaskListItemDto } from '../task/task.dto';

/** Подзадача в разделе «Подзадачи»: строка списка + свои подзадачи. */
export interface SubtaskDto extends TaskListItemDto {
  /** Сколько прямых подзадач у этой подзадачи. */
  subtaskCount: number;
}

/** Прямые подзадачи задачи и прогресс по ним. */
export interface SubtasksDto {
  items: SubtaskDto[];
  progress: SubtaskProgress;
}

/** Предок задачи — звено хлебных крошек. */
export interface TaskAncestorDto {
  number: number;
  /** `TSK-12` */
  key: string;
  title: string;
}

/** Кандидат в родители в поиске. */
export interface TaskParentOptionDto {
  taskId: string;
  number: number;
  key: string;
  title: string;
}
