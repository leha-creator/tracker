/** Ответ `GET /api/workspaces/[workspaceId]/members/[userId]/card` — карточка при наведении. */
export interface MemberCardData {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  position: string | null;
  role: 'owner' | 'member';
  openCount: number;
  overdueCount: number;
}
