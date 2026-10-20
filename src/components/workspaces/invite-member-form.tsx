'use client';

import { useActionState } from 'react';

import { FormError, FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  inviteMemberAction,
  type FormState,
  type InviteMemberResult,
} from '@/modules/workspaces/client';
import { WORKSPACE_ROLES } from '@/shared/access/workspace-role';

import { CopyLinkButton } from './copy-link-button';
import { WORKSPACE_ROLE_LABELS } from './role-label';

export function InviteMemberForm({ workspaceId }: { workspaceId: string }) {
  const [state, formAction, pending] = useActionState<FormState<InviteMemberResult>, FormData>(
    inviteMemberAction,
    null,
  );
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;

  return (
    <div className="grid gap-4">
      <form
        action={formAction}
        className="grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-start"
        noValidate
      >
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <FormField
          name="email"
          label="Email"
          type="email"
          autoComplete="off"
          required
          defaultValue={failure?.values.email}
          errors={fieldErrors?.email}
        />
        <div className="grid gap-2">
          <Label htmlFor="invite-role">Роль</Label>
          <Select name="role" defaultValue={failure?.values.role || 'member'}>
            <SelectTrigger id="invite-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORKSPACE_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {WORKSPACE_ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={pending} className="sm:mt-[1.375rem]">
          {pending ? 'Отправляем…' : 'Пригласить'}
        </Button>
        <div className="sm:col-span-3">
          <FormError message={fieldErrors ? undefined : failure?.error.message} />
        </div>
      </form>

      {state?.ok && (
        <div role="status" className="grid gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <p>
            {state.data.emailSent
              ? 'Приглашение отправлено на почту. Ссылку можно передать и самостоятельно:'
              : 'Письмо отправить не удалось. Передайте ссылку приглашённому самостоятельно:'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-sm bg-background px-2 py-1">
              {state.data.inviteUrl}
            </code>
            <CopyLinkButton url={state.data.inviteUrl} />
          </div>
        </div>
      )}
    </div>
  );
}
