/** Параметр адреса, который открывает панель создания справа (`?create=workspace`). */
export const CREATE_PANEL_PARAM = 'create';

export type CreatePanelKind = 'workspace' | 'project';

/** Панель «Новое пространство» — поверх списка пространств. */
export const NEW_WORKSPACE_HREF = `/?${CREATE_PANEL_PARAM}=workspace`;

/** Панель «Новый проект» — поверх списка проектов пространства. */
export function newProjectHref(workspaceSlug: string): string {
  return `/w/${workspaceSlug}?${CREATE_PANEL_PARAM}=project`;
}

/** Открыта ли панель `kind`: берём первое значение параметра, остальное — закрыто. */
export function isCreatePanelOpen(
  value: string | string[] | undefined,
  kind: CreatePanelKind,
): boolean {
  return (Array.isArray(value) ? value[0] : value) === kind;
}
