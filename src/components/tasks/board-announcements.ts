import type { Announcements, ScreenReaderInstructions, UniqueIdentifier } from '@dnd-kit/core';

export const SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    'Чтобы переместить карточку, нажмите пробел. Стрелки перемещают её внутри колонки и между ' +
    'колонками, пробел — оставить карточку на новом месте, Escape — отменить. Enter открывает задачу.',
};

interface BoardLookup {
  /** Ключ задачи (#42) по id. */
  cardLabel: (taskId: string) => string;
  /** Id статуса под карточкой или колонкой. */
  statusOf: (id: UniqueIdentifier) => string | null;
  statusName: (statusId: string | null) => string;
  /** Позиция карточки в её текущей колонке (с 1). */
  positionOf: (taskId: string) => { index: number; total: number };
}

/** Объявления скринридера на русском для перетаскивания карточек доски. */
export function createBoardAnnouncements(board: BoardLookup): Announcements {
  const where = (taskId: string) => {
    const { index, total } = board.positionOf(taskId);
    return `«${board.statusName(board.statusOf(taskId))}», позиция ${index} из ${total}`;
  };

  return {
    onDragStart: ({ active }) =>
      `Взята задача ${board.cardLabel(String(active.id))} из ${where(String(active.id))}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `Задача ${board.cardLabel(String(active.id))}: ${where(String(active.id))}.`
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `Задача ${board.cardLabel(String(active.id))} перемещена: ${where(String(active.id))}.`
        : `Задача ${board.cardLabel(String(active.id))} возвращена на место.`,
    onDragCancel: ({ active }) =>
      `Перемещение задачи ${board.cardLabel(String(active.id))} отменено.`,
  };
}
