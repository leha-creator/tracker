'use client';

import { CopyIcon } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { FormError, FormField } from '@/components/forms/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  confirmEnableTwoFactorAction,
  disableTwoFactorAction,
  formatTotpSecret,
  parseTotpUri,
  regenerateBackupCodesAction,
  startEnableTwoFactorAction,
  type MyTwoFactorState,
  type TwoFactorSetup,
} from '@/modules/auth/client';
import type { FormState } from '@/shared/types';

import { BackupCodes } from './backup-codes';
import { TotpQrCode } from './totp-qr-code';

interface TwoFactorSectionProps {
  state: MyTwoFactorState;
  email: string;
}

/** Двухфакторная аутентификация: состояние, включение (мастер), выключение и резервные коды. */
export function TwoFactorSection({ state, email }: TwoFactorSectionProps) {
  const [dialog, setDialog] = useState<'enable' | 'disable' | 'codes' | null>(null);
  const close = () => setDialog(null);

  if (!state.hasPassword) {
    return (
      <p className="text-sm text-muted-foreground">
        Вы входите через GitHub — двухфакторную защиту там настраивает GitHub. Чтобы включить её для
        входа по паролю, сначала задайте пароль через{' '}
        <Link href="/forgot-password" className="text-foreground underline underline-offset-4">
          «Забыли пароль?»
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {state.enabled ? <Badge>Включена</Badge> : <Badge variant="secondary">Выключена</Badge>}
        <p className="text-sm text-muted-foreground">
          {state.enabled
            ? 'При входе по паролю нужен код из приложения-аутентификатора.'
            : 'Для входа достаточно пароля.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {state.enabled ? (
          <>
            <Button type="button" variant="outline" onClick={() => setDialog('codes')}>
              Новые резервные коды
            </Button>
            <Button type="button" variant="outline" onClick={() => setDialog('disable')}>
              Выключить
            </Button>
          </>
        ) : (
          <Button type="button" onClick={() => setDialog('enable')}>
            Включить
          </Button>
        )}
      </div>

      {dialog === 'enable' && <EnableTwoFactorDialog email={email} onClose={close} />}
      {dialog === 'disable' && (
        <PasswordDialog
          title="Выключить двухфакторную аутентификацию?"
          description="Для входа снова будет достаточно пароля. Резервные коды перестанут действовать."
          confirmLabel="Выключить"
          destructive
          action={disableTwoFactorAction}
          onSuccess={() => {
            toast.success('Двухфакторная аутентификация выключена');
            close();
          }}
          onClose={close}
        />
      )}
      {dialog === 'codes' && <RegenerateCodesDialog email={email} onClose={close} />}
    </div>
  );
}

// ── Включение ────────────────────────────────────────────────────────────────

function EnableTwoFactorDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [saved, setSaved] = useState(false);

  const step = !setup ? 'password' : !confirmed ? 'scan' : 'codes';
  // Пока коды не сохранены, диалог не закрывается случайно (клик снаружи, Esc).
  const locked = step === 'codes' && !saved;

  return (
    <Dialog open onOpenChange={(open) => !open && !locked && onClose()}>
      <DialogContent className="sm:max-w-md">
        {step === 'password' && (
          <>
            <DialogHeader>
              <DialogTitle>Включить двухфакторную аутентификацию</DialogTitle>
              <DialogDescription>
                Понадобится приложение-аутентификатор: Google Authenticator, Яндекс Ключ, 1Password
                или другое с поддержкой TOTP. Сначала подтвердите пароль.
              </DialogDescription>
            </DialogHeader>
            <PasswordForm
              action={startEnableTwoFactorAction}
              confirmLabel="Продолжить"
              onSuccess={setSetup}
              onCancel={onClose}
            />
          </>
        )}
        {step === 'scan' && setup && (
          <ScanStep setup={setup} onConfirmed={() => setConfirmed(true)} onCancel={onClose} />
        )}
        {step === 'codes' && setup && (
          <>
            <DialogHeader>
              <DialogTitle>Сохраните резервные коды</DialogTitle>
              <DialogDescription>
                Двухфакторная аутентификация включена. Если телефон потеряется, войти можно по
                одному из этих кодов. Каждый код действует один раз, показываем их только сейчас.
              </DialogDescription>
            </DialogHeader>
            <BackupCodes codes={setup.backupCodes} email={email} />
            <div className="flex items-center gap-2">
              <Checkbox
                id="backupCodesSaved"
                checked={saved}
                onCheckedChange={(value) => setSaved(value === true)}
              />
              <Label htmlFor="backupCodesSaved" className="font-normal">
                Я сохранил коды в надёжном месте
              </Label>
            </div>
            <DialogFooter>
              <Button type="button" disabled={!saved} onClick={onClose}>
                Готово
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ScanStep({
  setup,
  onConfirmed,
  onCancel,
}: {
  setup: TwoFactorSetup;
  onConfirmed: () => void;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    confirmEnableTwoFactorAction,
    null,
  );
  const failure = state && !state.ok ? state : null;
  const secret = parseTotpUri(setup.totpURI)?.secret ?? null;

  useEffect(() => {
    if (state?.ok) onConfirmed();
  }, [state, onConfirmed]);

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      toast.success('Ключ скопирован');
    } catch {
      toast.error('Не удалось скопировать ключ');
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Отсканируйте QR-код</DialogTitle>
        <DialogDescription>
          Откройте приложение-аутентификатор, добавьте аккаунт по QR-коду и введите код, который оно
          покажет.
        </DialogDescription>
      </DialogHeader>
      <div className="grid justify-items-center gap-3">
        <TotpQrCode uri={setup.totpURI} />
        {secret && (
          <div className="grid justify-items-center gap-1 text-center">
            <p className="text-xs text-muted-foreground">Или введите ключ вручную:</p>
            <div className="flex items-center gap-1">
              <code className="rounded-sm bg-muted px-2 py-1 text-center font-mono text-sm">
                {formatTotpSecret(secret)}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Скопировать ключ"
                onClick={() => void copySecret()}
              >
                <CopyIcon aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </div>
      <form action={formAction} className="grid gap-4" noValidate>
        <FormError message={failure?.error.fieldErrors ? undefined : failure?.error.message} />
        <FormField
          name="code"
          label="Код из приложения"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123 456"
          maxLength={9}
          autoFocus
          required
          errors={failure?.error.fieldErrors?.code}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Отмена
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Проверяем…' : 'Подтвердить'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

// ── Подтверждение паролем ─────────────────────────────────────────────────────

function PasswordForm<T>({
  action,
  confirmLabel,
  destructive,
  onSuccess,
  onCancel,
}: {
  action: (prev: FormState<T>, formData: FormData) => Promise<FormState<T>>;
  confirmLabel: string;
  destructive?: boolean;
  onSuccess: (data: T) => void;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState<FormState<T>, FormData>(action, null);
  const failure = state && !state.ok ? state : null;

  // Один вызов на каждый успешный ответ: onSuccess может меняться при перерисовке.
  const handled = useRef<FormState<T>>(null);
  useEffect(() => {
    if (!state?.ok || handled.current === state) return;
    handled.current = state;
    onSuccess(state.data);
  }, [state, onSuccess]);

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormError message={failure?.error.fieldErrors ? undefined : failure?.error.message} />
      <FormField
        name="password"
        label="Пароль"
        type="password"
        autoComplete="current-password"
        autoFocus
        required
        errors={failure?.error.fieldErrors?.password}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={pending}>
          {pending ? 'Подождите…' : confirmLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

function PasswordDialog({
  title,
  description,
  confirmLabel,
  destructive,
  action,
  onSuccess,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  onSuccess: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <PasswordForm
          action={action}
          confirmLabel={confirmLabel}
          destructive={destructive}
          onSuccess={onSuccess}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

function RegenerateCodesDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const [codes, setCodes] = useState<string[] | null>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {codes ? 'Новые резервные коды' : 'Создать новые резервные коды?'}
          </DialogTitle>
          <DialogDescription>
            {codes
              ? 'Сохраните коды: показываем их только сейчас. Прежние коды больше не действуют.'
              : 'Прежние коды перестанут действовать. Подтвердите пароль.'}
          </DialogDescription>
        </DialogHeader>
        {codes ? (
          <>
            <BackupCodes codes={codes} email={email} />
            <DialogFooter>
              <Button type="button" onClick={onClose}>
                Готово
              </Button>
            </DialogFooter>
          </>
        ) : (
          <PasswordForm
            action={regenerateBackupCodesAction}
            confirmLabel="Создать коды"
            onSuccess={setCodes}
            onCancel={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
