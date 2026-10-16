import { ValidationError } from '@/shared/errors';

/** `42`, `#42`, `TSK-42` или `tsk-42` (с пробелами по краям). */
const TASK_REF_RE = /^\s*(?:#|([A-Za-z][A-Za-z0-9]{1,9})-)?([1-9]\d{0,8})\s*$/;

/**
 * Ссылка на задачу от агента → номер в пространстве токена. Ключ, если указан, должен совпадать
 * с ключом пространства: агент мог перепутать репозиторий или пространство.
 */
export function parseTaskRef(ref: string | number, taskKey: string | null): number {
  const value = String(ref);
  const match = TASK_REF_RE.exec(value);
  if (!match) {
    const example = taskKey ? `${taskKey}-42` : '42';
    throw new ValidationError(`Не понял ссылку на задачу «${value}». Пример: ${example}`);
  }
  const key = match[1]?.toUpperCase();
  if (key && key !== taskKey) {
    const hint = taskKey
      ? `ключ задач этого пространства — ${taskKey}`
      : 'у этого пространства нет ключа задач, используйте номер';
    throw new ValidationError(`Задача ${key}-${match[2]} не из этого пространства: ${hint}`);
  }
  return Number(match[2]);
}

/** `TSK-42`, а без ключа пространства — `#42` (как в интерфейсе). */
export function taskKeyOf(number: number, taskKey: string | null): string {
  return taskKey ? `${taskKey}-${number}` : `#${number}`;
}

export function taskUrl(baseUrl: string, workspaceSlug: string, number: number): string {
  return `${baseUrl.replace(/\/+$/, '')}/w/${workspaceSlug}/tasks/${number}`;
}
