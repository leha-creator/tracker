'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { updateTaskAction, type TaskDto, type TaskPriority } from '@/modules/tasks/client';

import { TaskProperty } from './task-panel/task-property';
import { useTaskSaveStatus } from './task-panel/task-save-status';
import {
  AssigneeSelect,
  DueDatePicker,
  PrioritySelect,
  TaskDescriptionInput,
  TaskTitleInput,
  type MemberOption,
} from './task-fields';

type TaskField = 'title' | 'description' | 'priority' | 'dueDate' | 'assigneeId';

/**
 * Автосохранение одного поля задачи: `updateTaskAction` принимает частичное обновление,
 * поэтому каждое поле отправляется отдельно, без общей формы. Ошибка — toast, результат —
 * `false` (поле откатывает значение).
 */
function useTaskAutosave(workspaceId: string, taskId: string) {
  const { begin } = useTaskSaveStatus();
  const [, startTransition] = useTransition();

  return useCallback(
    (field: TaskField, value: string) =>
      new Promise<boolean>((resolve) => {
        const formData = new FormData();
        formData.set('workspaceId', workspaceId);
        formData.set('taskId', taskId);
        formData.set(field, value);
        const end = begin();
        startTransition(async () => {
          const result = await updateTaskAction(null, formData);
          const ok = Boolean(result?.ok);
          if (result && !result.ok) {
            const fieldMessage = result.error.fieldErrors?.[field]?.join(' ');
            toast.error(fieldMessage ?? result.error.message);
          }
          end(ok);
          resolve(ok);
        });
      }),
    [workspaceId, taskId, begin],
  );
}

interface EditorProps {
  workspaceId: string;
  task: TaskDto;
}

/**
 * Текстовое поле с автосохранением по blur: пустое название не сохраняется (возвращается
 * прежнее), неизменённое — не отправляется, ошибка — откат к последнему сохранённому.
 */
function useTextCommit(
  workspaceId: string,
  taskId: string,
  field: 'title' | 'description',
  initial: string,
) {
  const save = useTaskAutosave(workspaceId, taskId);
  const saved = useRef(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  function revert() {
    if (ref.current) ref.current.value = saved.current;
  }

  async function commit(raw: string) {
    const value = field === 'title' ? raw.trim().replace(/\s+/g, ' ') : raw.trim();
    if (field === 'title' && value === '') return revert();
    if (value === saved.current.trim()) return;
    const previous = saved.current;
    saved.current = value;
    if (!(await save(field, value))) {
      saved.current = previous;
      revert();
    }
  }

  return { ref, commit, revert };
}

export function TaskTitleEditor({ workspaceId, task }: EditorProps) {
  const { ref, commit, revert } = useTextCommit(workspaceId, task.id, 'title', task.title);
  return (
    <TaskTitleInput
      ref={ref}
      id="task-title"
      name="title"
      defaultValue={task.title}
      onCommit={commit}
      onRevert={revert}
    />
  );
}

export function TaskDescriptionEditor({
  workspaceId,
  task,
  labelledBy,
}: EditorProps & { labelledBy: string }) {
  const initial = task.description ?? '';
  const { ref, commit, revert } = useTextCommit(workspaceId, task.id, 'description', initial);
  return (
    <TaskDescriptionInput
      ref={ref}
      id="task-description"
      name="description"
      labelledBy={labelledBy}
      defaultValue={initial}
      onCommit={commit}
      onRevert={revert}
    />
  );
}

/** Значение select или срока: показывается сразу, при ошибке сохранения — откат. */
function useOptimisticField<T extends string>(
  save: (field: TaskField, value: string) => Promise<boolean>,
  field: TaskField,
  initial: T,
) {
  const [value, setValue] = useState(initial);
  async function change(next: T) {
    if (next === value) return;
    const previous = value;
    setValue(next);
    if (!(await save(field, next))) setValue(previous);
  }
  return [value, change] as const;
}

/** Строки свойств «Ответственный», «Срок», «Приоритет» (внутри `TaskPropertyList`). */
export function TaskPropertiesEditor({
  workspaceId,
  task,
  members,
}: EditorProps & { members: MemberOption[] }) {
  const save = useTaskAutosave(workspaceId, task.id);
  const [assigneeId, setAssigneeId] = useOptimisticField(
    save,
    'assigneeId',
    task.assignee?.userId ?? '',
  );
  const [dueDate, setDueDate] = useOptimisticField(save, 'dueDate', task.dueDate ?? '');
  const [priority, setPriority] = useOptimisticField<TaskPriority>(save, 'priority', task.priority);
  // Ответственный, вышедший из пространства, снимается триггером; на случай гонки — добавляем в список.
  const options =
    task.assignee && !members.some((member) => member.userId === task.assignee?.userId)
      ? [...members, { userId: task.assignee.userId, name: task.assignee.name }]
      : members;

  return (
    <>
      <TaskProperty labelId="task-assignee-label" label="Ответственный">
        <AssigneeSelect
          id="task-assignee"
          labelledBy="task-assignee-label"
          members={options}
          value={assigneeId}
          onChange={setAssigneeId}
        />
      </TaskProperty>
      <TaskProperty labelId="task-due-label" label="Срок">
        <DueDatePicker
          id="task-due"
          labelledBy="task-due-label"
          value={dueDate}
          onChange={setDueDate}
          // Просрочка с сервера учитывает статус «Готово»; для нового значения — сравнение с сегодня.
          isOverdue={dueDate === (task.dueDate ?? '') ? task.isOverdue : undefined}
        />
      </TaskProperty>
      <TaskProperty labelId="task-priority-label" label="Приоритет">
        <PrioritySelect
          id="task-priority"
          labelledBy="task-priority-label"
          value={priority}
          onChange={setPriority}
        />
      </TaskProperty>
    </>
  );
}
