'use client';

import { Link2Off } from 'lucide-react';
import { useActionState, useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  dismissPullRequestAction,
  linkPullRequestByUrlAction,
} from '@/modules/integrations/github/client';
import type { FormState } from '@/shared/types';

/** «Отвязать» PR: автоматика его больше не привяжет. */
export function DismissPullRequestButton({
  workspaceId,
  taskId,
  pullRequestId,
  label,
}: {
  workspaceId: string;
  taskId: string;
  pullRequestId: string;
  /** Для скринридера: какой PR. */
  label: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    dismissPullRequestAction,
    null,
  );
  const error = state && !state.ok ? state.error.message : undefined;
  return (
    <form action={formAction} className="grid justify-items-end">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="pullRequestId" value={pullRequestId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        className="size-7"
        disabled={pending}
        aria-label={`Отвязать ${label}`}
        title="Отвязать"
      >
        <Link2Off className="size-4" />
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

/** Привязать PR по ссылке (репозиторий должен быть подключён к пространству). */
export function LinkPullRequestForm({
  workspaceId,
  taskId,
}: {
  workspaceId: string;
  taskId: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    linkPullRequestByUrlAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const failure = state && !state.ok ? state : null;
  const error = failure?.error.fieldErrors?.url?.join(' ') ?? failure?.error.message;

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-1.5" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="taskId" value={taskId} />
      <div className="flex gap-2">
        <Input
          name="url"
          type="url"
          inputMode="url"
          placeholder="https://github.com/owner/repo/pull/12"
          aria-label="Ссылка на PR"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'link-pr-error' : undefined}
          defaultValue={failure?.values.url}
          className="h-8 text-sm"
        />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? 'Привязываем…' : 'Привязать'}
        </Button>
      </div>
      {error && (
        <p id="link-pr-error" role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
