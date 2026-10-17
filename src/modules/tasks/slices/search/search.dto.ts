/** Задача в результатах глобального поиска (палитра Cmd+K). */
export interface TaskSearchResultDto {
  taskId: string;
  number: number;
  /** `TSK-42` */
  key: string;
  title: string;
  /** Статус в первом проекте задачи; null — задача ни в одном проекте. */
  status: { name: string; category: string; projectName: string } | null;
  /** Ещё проектов, кроме показанного. */
  moreProjects: number;
}
