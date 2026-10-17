import type { TaskLabelColor } from '../../models';

/** Метка на задаче, карточке и в строке списка. */
export interface TaskLabelRefDto {
  id: string;
  name: string;
  color: TaskLabelColor;
}

/** Метка пространства в настройках и в выборе меток задачи. */
export interface TaskLabelDto extends TaskLabelRefDto {
  /** Задачи с этой меткой. */
  tasksCount: number;
}
