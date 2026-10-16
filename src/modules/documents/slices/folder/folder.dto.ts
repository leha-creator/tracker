/** Папка в дереве раздела «Документы» (плоский список, дерево строит UI). */
export interface DocumentFolderDto {
  id: string;
  parentId: string | null;
  name: string;
  /** Документы прямо в этой папке (без вложенных). */
  documentsCount: number;
}

/** Папка в хлебных крошках. */
export interface FolderCrumbDto {
  id: string;
  name: string;
}

export interface FolderDeletedDto {
  /** Удалённые вместе с папкой документы (во всех подпапках). */
  documentsDeleted: number;
}
