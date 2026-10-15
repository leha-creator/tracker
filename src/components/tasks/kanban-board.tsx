'use client';

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { StatusDot } from '@/components/projects/status-badge';
import { cn } from '@/lib/utils';
import { STATUS_CATEGORY_LABELS, type ProjectStatusDto } from '@/modules/projects/client';
import {
  findCardColumn,
  moveCard,
  movePlacementAction,
  prevTaskIdAt,
  type BoardCardDto,
  type BoardCardsDto,
} from '@/modules/tasks/client';

import { createBoardAnnouncements, SCREEN_READER_INSTRUCTIONS } from './board-announcements';
import { QuickCreateTask } from './quick-create-task';
import { SortableTaskCard } from './sortable-task-card';
import { TaskCard } from './task-card';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

const COLUMN_PREFIX = 'column:';
/** После броска браузер может прислать click по карточке — гасим его в этом окне. */
const CLICK_SUPPRESS_MS = 250;

const columnId = (statusId: string) => `${COLUMN_PREFIX}${statusId}`;

interface KanbanBoardProps {
  workspaceId: string;
  workspaceSlug: string;
  projectId: string;
  statuses: ProjectStatusDto[];
  cards: BoardCardsDto;
}

interface DragOrigin {
  statusId: string;
  prevTaskId: string | null;
}

/**
 * Канбан-доска проекта: колонки — статусы, карточки перетаскиваются внутри колонки и между
 * колонками. Состояние оптимистичное; при ошибке сервера доска возвращается к данным сервера.
 */
export function KanbanBoard({
  workspaceId,
  workspaceSlug,
  projectId,
  statuses,
  cards,
}: KanbanBoardProps) {
  const dndId = useId();
  const router = useRouter();
  const reduceMotion = usePrefersReducedMotion();
  const [, startTransition] = useTransition();

  // Новые данные сервера (после revalidate) заменяют локальное состояние доски.
  const [serverCards, setServerCards] = useState(cards);
  const [columns, setColumns] = useState(cards);
  if (cards !== serverCards) {
    setServerCards(cards);
    setColumns(cards);
  }

  const [activeId, setActiveId] = useState<string | null>(null);
  const origin = useRef<DragOrigin | null>(null);
  const droppedAt = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter на карточке-ссылке открывает задачу; перетаскивание — только по Space.
      keyboardCodes: {
        start: [KeyboardCode.Space],
        cancel: [KeyboardCode.Esc],
        end: [KeyboardCode.Space],
      },
    }),
  );

  const statusOf = (id: UniqueIdentifier): string | null => {
    const value = String(id);
    return value.startsWith(COLUMN_PREFIX)
      ? value.slice(COLUMN_PREFIX.length)
      : findCardColumn(columns, value);
  };

  const activeCard =
    activeId === null
      ? null
      : (Object.values(columns)
          .flat()
          .find((card) => card.taskId === activeId) ?? null);

  function handleDragStart({ active }: DragStartEvent) {
    const taskId = String(active.id);
    const statusId = findCardColumn(columns, taskId);
    if (statusId === null) return;
    const column = columns[statusId] ?? [];
    const index = column.findIndex((card) => card.taskId === taskId);
    origin.current = { statusId, prevTaskId: prevTaskIdAt(column, index) };
    setActiveId(taskId);
  }

  // Между колонками карточка переносится сразу, чтобы целевая колонка раздвинулась под неё.
  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const taskId = String(active.id);
    const fromStatusId = findCardColumn(columns, taskId);
    const toStatusId = statusOf(over.id);
    if (fromStatusId === null || toStatusId === null || fromStatusId === toStatusId) return;

    const target = columns[toStatusId] ?? [];
    const overIndex = target.findIndex((card) => card.taskId === String(over.id));
    const translated = active.rect.current.translated;
    // Ниже карточки — когда центр перетаскиваемой карточки прошёл её середину.
    const isBelow =
      translated !== null &&
      translated.top + translated.height / 2 > over.rect.top + over.rect.height / 2;
    const index = overIndex === -1 ? target.length : overIndex + (isBelow ? 1 : 0);
    setColumns((current) => moveCard(current, taskId, toStatusId, index));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const taskId = String(active.id);
    const start = origin.current;
    origin.current = null;
    setActiveId(null);
    droppedAt.current = Date.now();
    if (!over || !start) {
      setColumns(cards);
      return;
    }

    const statusId = findCardColumn(columns, taskId);
    if (statusId === null) return;
    let next = columns;
    const column = columns[statusId] ?? [];
    const overIndex = column.findIndex((card) => card.taskId === String(over.id));
    const ownIndex = column.findIndex((card) => card.taskId === taskId);
    if (overIndex !== -1 && overIndex !== ownIndex) {
      next = moveCard(columns, taskId, statusId, overIndex);
      setColumns(next);
    }

    const finalColumn = next[statusId] ?? [];
    const prevTaskId = prevTaskIdAt(
      finalColumn,
      finalColumn.findIndex((card) => card.taskId === taskId),
    );
    if (statusId === start.statusId && prevTaskId === start.prevTaskId) return;

    startTransition(async () => {
      const result = await movePlacementAction({
        workspaceId,
        taskId,
        projectId,
        statusId,
        prevTaskId,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        setColumns(cards);
        router.refresh();
      }
    });
  }

  function handleDragCancel() {
    origin.current = null;
    setActiveId(null);
    droppedAt.current = Date.now();
    setColumns(cards);
  }

  const cardLabel = (taskId: string) =>
    Object.values(columns)
      .flat()
      .find((card) => card.taskId === taskId)?.key ?? 'Задача';
  const statusName = (statusId: string | null) =>
    statuses.find((status) => status.id === statusId)?.name ?? '';

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      accessibility={{
        screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
        announcements: createBoardAnnouncements({
          cardLabel,
          statusOf: (id) => statusOf(id),
          statusName,
          positionOf: (taskId) => {
            const statusId = findCardColumn(columns, taskId);
            const column = statusId ? (columns[statusId] ?? []) : [];
            return {
              index: column.findIndex((card) => card.taskId === taskId) + 1,
              total: column.length,
            };
          },
        }),
      }}
    >
      <div className="-mx-6 overflow-x-auto px-6 pb-2">
        <ol className="flex min-w-max items-start gap-3" aria-label="Колонки доски">
          {statuses.map((status) => (
            <BoardColumn
              key={status.id}
              status={status}
              cards={columns[status.id] ?? []}
              workspaceId={workspaceId}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              shouldSuppressClick={() => Date.now() - droppedAt.current < CLICK_SUPPRESS_MS}
              reduceMotion={reduceMotion}
            />
          ))}
        </ol>
      </div>
      <DragOverlay dropAnimation={reduceMotion ? null : undefined}>
        {activeCard && (
          <TaskCard
            card={activeCard}
            href={`/w/${workspaceSlug}/tasks/${activeCard.number}`}
            tabIndex={-1}
            className="cursor-grabbing shadow-lg ring-2 ring-primary/30"
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}

interface BoardColumnProps {
  status: ProjectStatusDto;
  cards: BoardCardDto[];
  workspaceId: string;
  workspaceSlug: string;
  projectId: string;
  shouldSuppressClick: () => boolean;
  reduceMotion: boolean;
}

/** Колонка доски: заголовок, сортируемый список карточек (зона броска — вся колонка). */
function BoardColumn({
  status,
  cards,
  workspaceId,
  workspaceSlug,
  projectId,
  shouldSuppressClick,
  reduceMotion,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId(status.id) });

  return (
    <li
      ref={setNodeRef}
      aria-label={`${status.name}: ${cards.length}`}
      className={cn(
        'flex w-72 shrink-0 flex-col gap-3 rounded-xl bg-muted/50 p-3 transition-colors',
        isOver && 'bg-muted',
      )}
    >
      <div className="flex items-center gap-2">
        <StatusDot color={status.color} />
        <h3 className="truncate text-sm font-medium">{status.name}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{cards.length}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {STATUS_CATEGORY_LABELS[status.category]}
        </span>
      </div>
      <SortableContext
        id={status.id}
        items={cards.map((card) => card.taskId)}
        strategy={verticalListSortingStrategy}
      >
        {cards.length > 0 ? (
          <ul className="grid gap-2">
            {cards.map((card) => (
              <li key={card.taskId}>
                <SortableTaskCard
                  card={card}
                  statusId={status.id}
                  href={`/w/${workspaceSlug}/tasks/${card.number}`}
                  shouldSuppressClick={shouldSuppressClick}
                  reduceMotion={reduceMotion}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p
            className={cn(
              'rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground',
              isOver && 'border-primary/50 text-foreground',
            )}
          >
            Нет задач
          </p>
        )}
      </SortableContext>
      <QuickCreateTask
        workspaceId={workspaceId}
        projectId={projectId}
        statusId={status.id}
        statusName={status.name}
      />
    </li>
  );
}
