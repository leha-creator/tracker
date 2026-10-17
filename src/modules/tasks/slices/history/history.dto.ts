import type { TaskHistoryKind } from '../../models';
import type { CreatedViaDto, TaskUserDto } from '../task/task.dto';

/** Запись истории задачи для ленты и MCP. */
export interface TaskHistoryItemDto {
  id: string;
  kind: TaskHistoryKind;
  /** Готовый текст без автора («Статус в „Разработка“: К выполнению → В работе»). */
  text: string;
  /** Автор; null — система (`source`) или удалённый пользователь. */
  actor: (TaskUserDto & { isAgent: boolean }) | null;
  /** Системный источник изменения: `github` или null. */
  source: string | null;
  /** Изменение сделано через токен MCP от имени человека. */
  via: CreatedViaDto | null;
  createdAt: Date;
  /** Время последней правки (записи подряд идущих правок сливаются). */
  updatedAt: Date;
}

export interface TaskHistoryDto {
  /** Всего записей у задачи. */
  total: number;
  /** От новых к старым: последние `TASK_HISTORY_PAGE_SIZE` или все. */
  items: TaskHistoryItemDto[];
}
