/** Ответ `GET /api/workspaces/[workspaceId]/members/[userId]/card` — карточка при наведении. */
export interface MemberCardData {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  position: string | null;
  role: 'owner' | 'member';
  /** Агент пространства: вместо роли и email — метка «Агент» и ответственный. */
  isAgent: boolean;
  responsibleName: string | null;
  openCount: number;
  overdueCount: number;
}
