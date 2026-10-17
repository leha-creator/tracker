import 'server-only';

import { searchDocuments } from '@/modules/documents';
import { searchTasks } from '@/modules/tasks';
import { listMembers, listMyWorkspaces } from '@/modules/workspaces';
import type { AuthSession } from '@/shared/auth';
import { createLogger } from '@/shared/logger';

import { isSearchableQuery, pickMatches, SEARCH_LIMIT_PER_GROUP } from '../../models';
import type { GlobalSearchResultDto } from './global.dto';
import type { GlobalSearchInput } from './global.schema';

const log = createLogger('search.global');

const EMPTY_RESULT: GlobalSearchResultDto = {
  tasks: [],
  documents: [],
  members: [],
  workspaces: [],
};

/**
 * Поиск палитры Cmd+K. В пространстве — три группы параллельно; доступ (участник, не архивное
 * пространство) проверяет каждая группа сама: чужое или архивное пространство → NOT_FOUND.
 * Вне пространства — активные пространства пользователя по названию.
 */
export async function globalSearch(
  session: AuthSession,
  input: GlobalSearchInput,
): Promise<GlobalSearchResultDto> {
  const { workspaceId, q } = input;
  const startedAt = Date.now();
  if (!isSearchableQuery(q)) return EMPTY_RESULT;

  let result: GlobalSearchResultDto;
  if (workspaceId) {
    const [tasks, documents, members] = await Promise.all([
      searchTasks(session, workspaceId, q, SEARCH_LIMIT_PER_GROUP),
      searchDocuments(session, workspaceId, q, SEARCH_LIMIT_PER_GROUP),
      listMembers(session, workspaceId),
    ]);
    result = {
      ...EMPTY_RESULT,
      tasks,
      documents,
      members: pickMatches(members, q, (member) => [member.name, member.email]).map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
        image: member.image,
        isAgent: member.isAgent,
      })),
    };
  } else {
    const workspaces = await listMyWorkspaces(session);
    result = {
      ...EMPTY_RESULT,
      workspaces: pickMatches(workspaces, q, (workspace) => [workspace.name]).map(
        ({ id, slug, name, icon }) => ({ id, slug, name, icon }),
      ),
    };
  }

  // Сам текст запроса не логируем — только длину и размеры групп.
  log.debug(
    {
      userId: session.user.id,
      workspaceId,
      qLength: q.length,
      tasks: result.tasks.length,
      documents: result.documents.length,
      members: result.members.length,
      workspaces: result.workspaces.length,
      durationMs: Date.now() - startedAt,
    },
    '[search] query',
  );
  return result;
}
