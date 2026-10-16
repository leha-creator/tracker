/** Запись журнала действий через MCP. */
export interface McpActivityDto {
  id: string;
  /** Имя инструмента MCP (`set_task_status`). */
  tool: string;
  /** Готовая строка: «Перевёл TSK-42: К выполнению → В работе». */
  summary: string;
  /** Ключ задачи (TSK-42 или #42) либо id документа; null — без цели. */
  targetKey: string | null;
  /** Название токена; null — токен удалён. */
  tokenName: string | null;
  createdAt: Date;
}

export interface McpActivityPageDto {
  items: McpActivityDto[];
  /** Курсор следующей страницы; null — записей больше нет. */
  nextCursor: string | null;
}
