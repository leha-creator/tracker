import type { DocumentFolderDto } from '@/modules/documents/client';

export interface FolderOption {
  /** id папки; 'root' — корень пространства. */
  value: string;
  label: string;
  depth: number;
  disabled: boolean;
}

export const ROOT_FOLDER_VALUE = 'root';

/**
 * Папки для выбора назначения: корень и дерево в порядке обхода, с отступом по глубине.
 * `excludeSubtreeOf` — папка, которую переносят: она и её потомки недоступны.
 */
export function folderOptions(
  folders: readonly DocumentFolderDto[],
  excludeSubtreeOf?: string,
): FolderOption[] {
  const children = new Map<string | null, DocumentFolderDto[]>();
  for (const folder of folders) {
    const list = children.get(folder.parentId) ?? [];
    list.push(folder);
    children.set(folder.parentId, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const options: FolderOption[] = [
    { value: ROOT_FOLDER_VALUE, label: 'Все документы (корень)', depth: 0, disabled: false },
  ];
  const visit = (parentId: string | null, depth: number, disabled: boolean) => {
    for (const folder of children.get(parentId) ?? []) {
      const blocked = disabled || folder.id === excludeSubtreeOf;
      options.push({ value: folder.id, label: folder.name, depth, disabled: blocked });
      visit(folder.id, depth + 1, blocked);
    }
  };
  visit(null, 1, false);
  return options;
}
