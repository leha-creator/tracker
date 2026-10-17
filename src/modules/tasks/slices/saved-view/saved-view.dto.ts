/** Сохранённый фильтр списка задач: ссылка — `<список>?<params>`. */
export interface SavedTaskViewDto {
  id: string;
  name: string;
  /** Канонические параметры списка без `?` и номера страницы. */
  params: string;
}
