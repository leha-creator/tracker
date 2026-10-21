/** Поручение конспекта в разделе «Созвоны». */
export interface MeetingActionItemDto {
  /** Номер поручения в конспекте — ключ для создания подзадачи. */
  index: number;
  owner: string;
  task: string;
  /** Срок `YYYY-MM-DD`; null — не указан. */
  due: string | null;
  /** Созданная подзадача; null — ещё не создана. */
  subtask: { id: string; number: number } | null;
}

export interface MeetingRecapDto {
  id: string;
  completedAt: Date;
  /** Заметка с конспектом; null — заметку удалили. */
  document: { id: string; title: string } | null;
  actionItems: MeetingActionItemDto[];
}

export interface TaskMeetingDto {
  id: string;
  code: string;
  url: string;
  host: { id: string; name: string; image: string | null } | null;
  startedAt: Date;
  /** null — встреча идёт (или meet ещё не сообщил о конце). */
  endedAt: Date | null;
  recaps: MeetingRecapDto[];
}
