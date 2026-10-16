import type { Announcements, ScreenReaderInstructions, UniqueIdentifier } from '@dnd-kit/core';

export const STATUS_SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    'Чтобы переместить статус, нажмите пробел. Стрелки вверх и вниз меняют его место, ' +
    'пробел — оставить статус на новом месте, Escape — отменить.',
};

interface StatusLookup {
  name: (id: UniqueIdentifier) => string;
  /** Позиция статуса в текущем порядке (с 1). */
  positionOf: (id: UniqueIdentifier) => { index: number; total: number };
}

/** Объявления скринридера на русском для перестановки статусов. */
export function createStatusAnnouncements(lookup: StatusLookup): Announcements {
  const where = (id: UniqueIdentifier) => {
    const { index, total } = lookup.positionOf(id);
    return `позиция ${index} из ${total}`;
  };

  return {
    onDragStart: ({ active }) => `Взят статус «${lookup.name(active.id)}», ${where(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `Статус «${lookup.name(active.id)}»: ${where(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `Статус «${lookup.name(active.id)}» перемещён: ${where(over.id)}.`
        : `Статус «${lookup.name(active.id)}» возвращён на место.`,
    onDragCancel: ({ active }) => `Перемещение статуса «${lookup.name(active.id)}» отменено.`,
  };
}
