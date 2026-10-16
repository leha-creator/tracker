import type { DocumentFolderDto, FolderCrumbDto } from '../folder/folder.dto';
import type { StorageUsageDto } from '../file/file.dto';
import type { LinkedDocumentDto } from '../task-link/task-link.dto';

/** Страница обзора: подпапки текущей папки (только в обзоре, на первой странице) и документы. */
export interface DocumentListPageDto {
  /** Цепочка от корня до текущей папки; пусто — корень пространства. */
  path: FolderCrumbDto[];
  folders: DocumentFolderDto[];
  /** В режиме поиска у каждого документа видна его папка. */
  documents: LinkedDocumentDto[];
  /** Поиск по всему пространству (задан поиск, тег или вид). */
  isSearch: boolean;
  total: number;
  /** Фактический номер страницы (запрошенный за пределами — последняя). */
  page: number;
  pageCount: number;
  pageSize: number;
}

export interface DocumentsOverviewDto {
  usage: StorageUsageDto;
  /** Недавно изменённые документы — для пустого корня и быстрых переходов. */
  recent: LinkedDocumentDto[];
}
