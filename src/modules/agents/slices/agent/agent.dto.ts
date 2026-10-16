/** Агент в списке пространства. */
export interface AgentDto {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  /** Ответственный участник; null — не назначен (вышел из пространства или удалён). */
  responsible: { userId: string; name: string } | null;
  /** Права в пространстве; у отключённого агента членства нет — false. */
  canManageProjects: boolean;
  canManageDocuments: boolean;
  createdAt: Date;
  disabledAt: Date | null;
}
