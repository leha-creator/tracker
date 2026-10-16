'use client';

import { useActionState, useEffect, useState, type ReactNode } from 'react';

import { FormError, FormField } from '@/components/forms/form-field';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  AGENT_DESCRIPTION_MAX_LENGTH,
  AGENT_NAME_MAX_LENGTH,
  createAgentAction,
  updateAgentAction,
  type AgentDto,
} from '@/modules/agents/client';
import type { FormState } from '@/shared/types';

/** Участник-человек: кандидат в ответственные агента. */
export interface ResponsibleOption {
  userId: string;
  name: string;
}

interface AgentFormDialogProps {
  workspaceId: string;
  /** Люди пространства (агенты исключены). */
  members: ResponsibleOption[];
  /** Правка существующего агента; без него — создание. */
  agent?: AgentDto;
  trigger: ReactNode;
}

/** Создание и правка агента: название, описание, ответственный, права в пространстве. */
export function AgentFormDialog({ workspaceId, members, agent, trigger }: AgentFormDialogProps) {
  const [open, setOpen] = useState(false);
  // Новый ключ — новая форма: после закрытия диалог открывается без прошлых ошибок.
  const [formKey, setFormKey] = useState(0);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setFormKey((key) => key + 1);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <AgentForm
          key={formKey}
          workspaceId={workspaceId}
          members={members}
          agent={agent}
          onDone={() => handleOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function AgentForm({
  workspaceId,
  members,
  agent,
  onDone,
}: Omit<AgentFormDialogProps, 'trigger'> & { onDone: () => void }) {
  const action = agent ? updateAgentAction : createAgentAction;
  const [state, formAction, pending] = useActionState<FormState<AgentDto>, FormData>(action, null);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;
  const values = failure?.values;
  const responsibleDefault =
    values?.responsibleUserId || agent?.responsible?.userId || members[0]?.userId || '';
  const disabled = Boolean(agent?.disabledAt);

  return (
    <form action={formAction} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{agent ? `Агент «${agent.name}»` : 'Новый агент'}</DialogTitle>
        <DialogDescription>
          Агент — отдельный участник пространства для Claude Code: задачи, комментарии и документы
          он создаёт от своего имени. Войти в интерфейс он не может, работает по токену.
        </DialogDescription>
      </DialogHeader>

      <input type="hidden" name="workspaceId" value={workspaceId} />
      {agent && <input type="hidden" name="agentId" value={agent.id} />}

      <FormField
        name="name"
        label="Название"
        placeholder="Claude — backend"
        maxLength={AGENT_NAME_MAX_LENGTH}
        defaultValue={values?.name ?? agent?.name}
        errors={fieldErrors?.name}
        required
        autoFocus
      />

      <div className="grid gap-2">
        <Label htmlFor="agent-description">Описание</Label>
        <Textarea
          id="agent-description"
          name="description"
          rows={3}
          maxLength={AGENT_DESCRIPTION_MAX_LENGTH}
          placeholder="Репозиторий, зона ответственности"
          defaultValue={values?.description ?? agent?.description ?? ''}
          aria-invalid={fieldErrors?.description ? true : undefined}
        />
        {fieldErrors?.description && (
          <p className="text-sm text-destructive">{fieldErrors.description.join(' ')}</p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="agent-responsible">Ответственный</Label>
        <Select name="responsibleUserId" defaultValue={responsibleDefault}>
          <SelectTrigger
            id="agent-responsible"
            className="w-full"
            aria-invalid={fieldErrors?.responsibleUserId ? true : undefined}
          >
            <SelectValue placeholder="Выберите участника" />
          </SelectTrigger>
          <SelectContent>
            {members.map((member) => (
              <SelectItem key={member.userId} value={member.userId}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Ему приходят уведомления, адресованные агенту: упоминания, назначения, комментарии.
        </p>
        {fieldErrors?.responsibleUserId && (
          <p className="text-sm text-destructive">{fieldErrors.responsibleUserId.join(' ')}</p>
        )}
      </div>

      <fieldset className="grid gap-2" disabled={disabled}>
        <legend className="mb-1 text-sm font-medium">Права в пространстве</legend>
        <PermissionCheckbox
          name="canManageProjects"
          label="Управление проектами"
          defaultChecked={readFlag(values?.canManageProjects, agent?.canManageProjects)}
        />
        <PermissionCheckbox
          name="canManageDocuments"
          label="Управление документами"
          defaultChecked={readFlag(values?.canManageDocuments, agent?.canManageDocuments)}
        />
        {disabled && (
          <p className="text-xs text-muted-foreground">
            Агент отключён: права выдаются после включения.
          </p>
        )}
      </fieldset>

      <FormError message={fieldErrors ? undefined : failure?.error.message} />
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? 'Сохраняем…' : agent ? 'Сохранить' : 'Создать агента'}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Значение после ошибки (чекбокс отправляет «on») или текущее значение агента. */
function readFlag(submitted: string | undefined, current: boolean | undefined): boolean {
  if (submitted !== undefined) return submitted === 'on';
  return current ?? false;
}

function PermissionCheckbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  const id = `agent-${name}`;
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} name={name} defaultChecked={defaultChecked} />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}
