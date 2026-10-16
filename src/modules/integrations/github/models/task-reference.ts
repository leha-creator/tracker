/** Ссылка на задачу в тексте GitHub: ключ пространства и номер (`TSK-42`). */
export interface TaskReference {
  /** Ключ в верхнем регистре. */
  key: string;
  number: number;
}

/**
 * `KEY-123` на границах слова: до и после — не буква и не цифра (`tsk-42-fix`, `[TSK-42]`,
 * `feature/tsk-42`). Формат ключа совпадает с правилом пространств
 * (src/modules/workspaces/models/task-key.ts: буква, затем 1–9 букв или цифр).
 * Номер — без ведущего нуля, не длиннее 9 цифр (как номер задачи в URL).
 */
const TASK_REFERENCE_RE =
  /(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]{1,9})-([1-9]\d{0,8})(?![A-Za-z0-9])/g;

/** Сколько ссылок разбирать из одного события: защита от огромных описаний PR. */
export const TASK_REFERENCES_LIMIT = 50;

/** Ссылки на задачи во всех текстах (имя ветки, заголовок, описание), без повторов, в порядке появления. */
export function findTaskReferences(...texts: (string | null | undefined)[]): TaskReference[] {
  const seen = new Set<string>();
  const references: TaskReference[] = [];
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(TASK_REFERENCE_RE)) {
      const key = match[1]!.toUpperCase();
      const number = Number(match[2]);
      const id = `${key}-${number}`;
      if (seen.has(id)) continue;
      seen.add(id);
      references.push({ key, number });
      if (references.length >= TASK_REFERENCES_LIMIT) return references;
    }
  }
  return references;
}

/** Номера задач по ключам: `{ TSK: [42, 7] }`. */
export function groupReferencesByKey(references: readonly TaskReference[]): Map<string, number[]> {
  const byKey = new Map<string, number[]>();
  for (const { key, number } of references) {
    const numbers = byKey.get(key) ?? [];
    numbers.push(number);
    byKey.set(key, numbers);
  }
  return byKey;
}
