'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { usePrefersReducedMotion } from '@/lib/use-prefers-reduced-motion';
import {
  moveStatusAction,
  reorderStatuses,
  STATUS_LIMIT,
  type ProjectStatusDto,
} from '@/modules/projects/client';

import { AddStatusForm } from './add-status-form';
import { SortableStatusRow } from './sortable-status-row';
import {
  createStatusAnnouncements,
  STATUS_SCREEN_READER_INSTRUCTIONS,
} from './status-announcements';

interface StatusListProps {
  workspaceId: string;
  projectId: string;
  statuses: ProjectStatusDto[];
}

/** Статусы двигаются только по вертикали. */
const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/**
 * Набор статусов проекта по порядку и форма добавления. Порядок меняется перетаскиванием
 * за ручку (указатель, касание, клавиатура); инварианты проверяет сервер.
 */
export function StatusList({ workspaceId, projectId, statuses }: StatusListProps) {
  const router = useRouter();
  const dndId = useId();
  const reduceMotion = usePrefersReducedMotion();
  const [pending, startTransition] = useTransition();

  // Новые данные сервера (после revalidate) заменяют локальный порядок.
  const [serverStatuses, setServerStatuses] = useState(statuses);
  const [order, setOrder] = useState(statuses);
  if (statuses !== serverStatuses) {
    setServerStatuses(statuses);
    setOrder(statuses);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const result = reorderStatuses(order, String(active.id), String(over.id));
    if (!result) return;
    setOrder(result.items);

    startTransition(async () => {
      const response = await moveStatusAction({
        workspaceId,
        projectId,
        statusId: String(active.id),
        prevStatusId: result.prevStatusId,
      });
      if (!response.ok) {
        toast.error(response.error.message);
        setOrder(statuses);
        router.refresh();
      }
    });
  }

  const nameOf = (id: UniqueIdentifier) =>
    order.find((status) => status.id === String(id))?.name ?? 'Статус';
  const atLimit = order.length >= STATUS_LIMIT;
  const isOnly = order.length === 1;

  return (
    <div className="@container grid gap-3">
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
        accessibility={{
          screenReaderInstructions: STATUS_SCREEN_READER_INSTRUCTIONS,
          announcements: createStatusAnnouncements({
            name: nameOf,
            positionOf: (id) => ({
              index: order.findIndex((status) => status.id === String(id)) + 1,
              total: order.length,
            }),
          }),
        }}
      >
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ol
            className="grid divide-y divide-foreground/[0.07] border-y border-foreground/[0.07]"
            aria-label="Статусы проекта"
          >
            {order.map((status) => (
              <SortableStatusRow
                // Ключ меняется вместе с данными: после сохранения строка берёт значения с сервера.
                key={`${status.id}:${status.name}:${status.category}:${status.color}:${status.tasksCount}`}
                workspaceId={workspaceId}
                projectId={projectId}
                status={status}
                otherStatuses={order.filter((other) => other.id !== status.id)}
                isOnly={isOnly}
                dragDisabled={isOnly || pending}
                reduceMotion={reduceMotion}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {isOnly && (
        <p className="text-sm text-muted-foreground">
          В проекте должен остаться хотя бы один статус — его нельзя удалить.
        </p>
      )}
      <AddStatusForm workspaceId={workspaceId} projectId={projectId} disabled={atLimit} />
      {atLimit && (
        <p className="text-sm text-muted-foreground">
          В проекте может быть не больше {STATUS_LIMIT} статусов.
        </p>
      )}
    </div>
  );
}
