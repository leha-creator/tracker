/** Ветка задачи для раздела «GitHub». */
export interface TaskBranchDto {
  repositoryFullName: string;
  name: string;
  /** Ветку удалили в GitHub. */
  deleted: boolean;
}

export interface TaskCommitDto {
  repositoryFullName: string;
  sha: string;
  /** Первая строка сообщения. */
  message: string;
  url: string;
  authorLogin: string | null;
  committedAt: Date;
}

export interface TaskBranchesAndCommitsDto {
  branches: TaskBranchDto[];
  /** Последние коммиты (не все). */
  commits: TaskCommitDto[];
  commitsTotal: number;
}
