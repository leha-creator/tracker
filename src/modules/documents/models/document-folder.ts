import { ValidationError } from '@/shared/errors/app-error';

export const FOLDER_NAME_MAX_LENGTH = 100;
/** Максимальная глубина дерева: папка в корне — уровень 1. */
export const FOLDER_MAX_DEPTH = 8;

const FORBIDDEN_NAME_CHARS = /[/\\:*?"<>|\u0000-\u001f\u007f]/;

function nameError(message: string): ValidationError {
  return new ValidationError(message, { fieldErrors: { name: [message] } });
}

/** Имя папки: NFC, без пробелов по краям, одиночные пробелы внутри, без символов путей. */
export function normalizeFolderName(raw: string): string {
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (name === '') throw nameError('Введите название папки');
  if (name === '.' || name === '..') throw nameError('Недопустимое название папки');
  if (FORBIDDEN_NAME_CHARS.test(name)) {
    throw nameError('Название не может содержать символы / \\ : * ? " < > |');
  }
  if (Array.from(name).length > FOLDER_NAME_MAX_LENGTH) {
    throw nameError(`Название не длиннее ${FOLDER_NAME_MAX_LENGTH} символов`);
  }
  return name;
}

/** Ключ уникальности имени в родителе: без учёта регистра. */
export function folderNameKey(name: string): string {
  return name.toLocaleLowerCase('ru');
}

/** `parentDepth` — глубина родителя (0 — корень пространства). */
export function assertCanCreateFolderIn(parentDepth: number): void {
  if (parentDepth + 1 > FOLDER_MAX_DEPTH) {
    throw new ValidationError(`Вложенность папок — не больше ${FOLDER_MAX_DEPTH} уровней`);
  }
}

export interface FolderMove {
  folderId: string;
  /** Папка назначения; null — корень пространства. */
  targetId: string | null;
  /** Цепочка от корня до папки назначения включительно (пусто для корня). */
  targetPathIds: readonly string[];
  /** Высота поддерева перемещаемой папки: 1 — папка без подпапок. */
  subtreeHeight: number;
}

/** Нельзя переместить папку в себя, во вложенную папку или глубже лимита. */
export function assertCanMoveFolder(move: FolderMove): void {
  const { folderId, targetId, targetPathIds, subtreeHeight } = move;
  if (targetId === folderId || targetPathIds.includes(folderId)) {
    throw new ValidationError('Нельзя переместить папку в саму себя или во вложенную папку');
  }
  if (targetPathIds.length + subtreeHeight > FOLDER_MAX_DEPTH) {
    throw new ValidationError(`Вложенность папок — не больше ${FOLDER_MAX_DEPTH} уровней`);
  }
}

export interface FolderNode {
  id: string;
  parentId: string | null;
  name: string;
}

/**
 * Цепочка папок от корня до `folderId` включительно по плоскому списку. Разорванная цепочка
 * (папки нет в списке) — пустой массив.
 */
export function folderPath<T extends FolderNode>(folders: readonly T[], folderId: string): T[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: T[] = [];
  let current = byId.get(folderId);
  while (current) {
    path.unshift(current);
    if (path.length > FOLDER_MAX_DEPTH + 1) return [];
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path[0]?.parentId === null ? path : [];
}

/** Путь папки строкой для показа: «Проект / Спецификации». */
export function formatFolderPath(path: readonly { name: string }[]): string {
  return path.map((folder) => folder.name).join(' / ');
}
