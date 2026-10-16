import type { DocumentSummaryDto } from '../document/document.dto';

/** Документ со строкой пути папки — в задаче и в поиске для привязки. */
export interface LinkedDocumentDto extends DocumentSummaryDto {
  /** «Проект / Спецификации»; пустая строка — корень пространства. */
  folderPath: string;
}

/** Задача для блока «Задачи» документа и поиска для привязки. */
export interface LinkedTaskDto {
  id: string;
  number: number;
  /** `#42` */
  key: string;
  title: string;
  isDone: boolean;
}
