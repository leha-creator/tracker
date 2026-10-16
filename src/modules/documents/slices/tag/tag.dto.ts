import type { DocumentTagColor } from '../../models';

export interface TagDto {
  id: string;
  name: string;
  color: DocumentTagColor;
  /** Документы с этим тегом (заметки и подтверждённые файлы). */
  documentsCount: number;
}
