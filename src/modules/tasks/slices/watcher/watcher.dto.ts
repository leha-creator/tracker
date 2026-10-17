import type { TaskUserDto } from '../task/task.dto';

/** Наблюдатели задачи и подписка текущего пользователя. */
export interface TaskWatchersDto {
  watching: boolean;
  watchers: TaskUserDto[];
}
