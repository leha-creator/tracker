'use client';

import { useActionState, useState } from 'react';

import { FormError } from '@/components/forms/form-field';
import { StatusDot } from '@/components/projects/status-badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { KEEP_STATUS, updateProjectAutomationAction } from '@/modules/integrations/github/client';
import type { ProjectStatusDto } from '@/modules/projects/client';
import type { FormState } from '@/shared/types';

interface ProjectAutomationFormProps {
  workspaceId: string;
  projectId: string;
  statuses: ProjectStatusDto[];
  prOpenedStatusId: string | null;
  prMergedStatusId: string | null;
}

/** Автосмена статуса задачи по событиям PR: два селекта со статусами проекта или «Не менять». */
export function ProjectAutomationForm({
  workspaceId,
  projectId,
  statuses,
  prOpenedStatusId,
  prMergedStatusId,
}: ProjectAutomationFormProps) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateProjectAutomationAction,
    null,
  );
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="projectId" value={projectId} />
      <FormError message={fieldErrors ? undefined : failure?.error.message} />
      <AutomationSelect
        name="prOpenedStatusId"
        label="Когда PR открыт или готов к ревью"
        statuses={statuses}
        initial={failure?.values.prOpenedStatusId ?? prOpenedStatusId}
        errors={fieldErrors?.prOpenedStatusId}
      />
      <AutomationSelect
        name="prMergedStatusId"
        label="Когда PR слит"
        statuses={statuses}
        initial={failure?.values.prMergedStatusId ?? prMergedStatusId}
        errors={fieldErrors?.prMergedStatusId}
      />
      <p className="text-sm text-muted-foreground">
        Статус меняется только вперёд: задачу в «Готово» слитый PR не вернёт в работу.
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        {state?.ok && (
          <span role="status" className="text-sm text-muted-foreground">
            Сохранено
          </span>
        )}
      </div>
    </form>
  );
}

function AutomationSelect({
  name,
  label,
  statuses,
  initial,
  errors,
}: {
  name: string;
  label: string;
  statuses: ProjectStatusDto[];
  initial: string | null;
  errors?: string[];
}) {
  // Удалённый статус (настройка уже сброшена в БД) или пусто — «Не менять».
  const known = initial && statuses.some((status) => status.id === initial) ? initial : KEEP_STATUS;
  const [value, setValue] = useState(known);
  const id = `${name}-trigger`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select name={name} value={value} onValueChange={setValue}>
        <SelectTrigger id={id} className="w-full sm:w-72" aria-invalid={errors ? true : undefined}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={KEEP_STATUS}>Не менять</SelectItem>
          {statuses.map((status) => (
            <SelectItem key={status.id} value={status.id}>
              <StatusDot color={status.color} />
              {status.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {errors && <p className="text-sm text-destructive">{errors.join(' ')}</p>}
    </div>
  );
}
