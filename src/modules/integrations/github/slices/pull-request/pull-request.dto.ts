import type { ChecksState, PullRequestState, ReviewState } from '../../models';

/** PR, привязанный к задаче, — для раздела «GitHub» задачи. Id GitHub — строкой. */
export interface TaskPullRequestDto {
  id: string;
  repositoryFullName: string;
  number: number;
  title: string;
  url: string;
  state: PullRequestState;
  reviewState: ReviewState;
  checksState: ChecksState;
  authorLogin: string | null;
  source: 'auto' | 'manual';
  mergedAt: Date | null;
  updatedAt: Date;
}

/** Индикатор PR на карточке и в строке списка. */
export interface PullRequestBadgeDto {
  /** Самое заметное состояние среди PR задачи. */
  state: PullRequestState;
  count: number;
}

/** Индикаторы по id задачи; задач без PR в карте нет. */
export type PullRequestBadgesDto = Record<string, PullRequestBadgeDto>;
