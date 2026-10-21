'use client';

import { ListTodo } from 'lucide-react';
import Link from 'next/link';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { FormError } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createSubtasksFromActionItemsAction,
  matchesOwner,
  type MeetingActionItemDto,
} from '@/modules/integrations/meet/client';

/** Без ответственного — значение пункта Select (пустая строка у Radix запрещена). */
const NO_ASSIGNEE = 'none';
const DUE = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' });

interface ActionItemsDialogProps {
  workspaceId: string;
  recapId: string;
  /** Поручения; у созданных — адрес подзадачи (в той же панели или на странице). */
  items: (MeetingActionItemDto & { subtaskHref: string | null })[];
  members: { userId: string; name: string }[];
  disabled?: boolean;
}

/** Ответственный по умолчанию — участник с тем же именем, что в конспекте. */
function defaultAssignee(owner: string, members: ActionItemsDialogProps['members']): string {
  const matched = members.filter((member) => matchesOwner(owner, member.name));
  return matched.length === 1 ? matched[0]!.userId : NO_ASSIGNEE;
}

/** Поручения конспекта → подзадачи: выбор пунктов и ответственных. */
export function ActionItemsDialog({
  workspaceId,
  recapId,
  items,
  members,
  disabled,
}: ActionItemsDialogProps) {
  const [open, setOpen] = useState(false);
  const free = items.filter((item) => !item.subtask);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [assignees, setAssignees] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idPrefix = useId();

  function onOpenChange(next: boolean) {
    if (next) {
      // Каждый раз — свежий выбор: все ещё не созданные пункты и ответственные по именам.
      setSelected(new Set(free.map((item) => item.index)));
      setAssignees(
        Object.fromEntries(free.map((item) => [item.index, defaultAssignee(item.owner, members)])),
      );
      setError(null);
    }
    setOpen(next);
  }

  function toggle(index: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(index);
      else next.delete(index);
      return next;
    });
  }

  function submit() {
    const chosen = free.filter((item) => selected.has(item.index));
    if (chosen.length === 0) {
      setError('Выберите поручения');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createSubtasksFromActionItemsAction({
        workspaceId,
        recapId,
        items: chosen.map((item) => {
          const assignee = assignees[item.index];
          return {
            index: item.index,
            assigneeId: assignee && assignee !== NO_ASSIGNEE ? assignee : null,
          };
        }),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(`Создано подзадач: ${result.data.created}`);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" disabled={disabled}>
          <ListTodo />
          Поручения ({items.length - free.length}/{items.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Поручения из конспекта</DialogTitle>
          <DialogDescription>
            Отмеченные поручения станут подзадачами этой задачи. Ответственного можно поменять.
          </DialogDescription>
        </DialogHeader>

        <ul className="grid max-h-[60vh] gap-2 overflow-y-auto">
          {items.map((item) => {
            const checkboxId = `${idPrefix}-item-${item.index}`;
            return (
              <li
                key={item.index}
                className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-[auto_1fr_12rem] sm:items-start"
              >
                <Checkbox
                  id={checkboxId}
                  checked={item.subtask ? true : selected.has(item.index)}
                  disabled={item.subtask !== null || pending}
                  onCheckedChange={(checked) => toggle(item.index, checked === true)}
                  className="mt-0.5"
                />
                <div className="grid min-w-0 gap-0.5">
                  <label htmlFor={checkboxId} className="break-words">
                    {item.task}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {item.owner ? `По конспекту: ${item.owner}` : 'Ответственный не назван'}
                    {item.due && ` · до ${DUE.format(new Date(`${item.due}T00:00:00`))}`}
                  </p>
                </div>
                {item.subtask && item.subtaskHref ? (
                  <Link
                    href={item.subtaskHref}
                    scroll={false}
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline sm:justify-self-end"
                  >
                    Подзадача #{item.subtask.number}
                  </Link>
                ) : (
                  <Select
                    value={assignees[item.index] ?? NO_ASSIGNEE}
                    onValueChange={(value) =>
                      setAssignees((prev) => ({ ...prev, [item.index]: value }))
                    }
                    disabled={pending || !selected.has(item.index)}
                  >
                    <SelectTrigger size="sm" aria-label={`Ответственный: ${item.task}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_ASSIGNEE}>Без ответственного</SelectItem>
                      {members.map((member) => (
                        <SelectItem key={member.userId} value={member.userId}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </li>
            );
          })}
        </ul>

        <FormError message={error ?? undefined} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={pending || free.length === 0}
            aria-busy={pending}
          >
            Создать подзадачи{selected.size > 0 && ` (${selected.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
