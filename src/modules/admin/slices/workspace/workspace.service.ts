import 'server-only';

import { getStorageUsageByWorkspaces } from '@/modules/documents';
import {
  deleteWorkspaceBySystem,
  getWorkspaceForAdmin,
  listAllWorkspaces,
  setWorkspaceArchivedBySystem,
  setWorkspaceStorageQuota,
  transferWorkspaceOwnership,
} from '@/modules/workspaces';
import { requireAdmin } from '@/shared/access';
import { auditActorFromSession, recordAuditEvent } from '@/shared/audit';
import { createLogger } from '@/shared/logger';

import {
  ADMIN_WORKSPACES_PAGE_SIZE,
  assertWorkspaceNameConfirmed,
  type AdminWorkspaceListQuery,
} from '../../models';
import type { AdminWorkspaceDetailDto, AdminWorkspaceListDto } from './workspace.dto';
import type {
  DeleteWorkspaceInput,
  SetStorageQuotaInput,
  TransferOwnershipInput,
} from './workspace.schema';

const log = createLogger('admin.workspace');

const EMPTY_STORAGE = { usedBytes: 0, filesCount: 0, quotaBytes: 0 };

export async function listAdminWorkspaces(
  query: AdminWorkspaceListQuery,
): Promise<AdminWorkspaceListDto> {
  const session = await requireAdmin();
  const { items, total } = await listAllWorkspaces({
    q: query.q,
    archived: query.status,
    sort: query.sort,
    dir: query.dir,
    page: query.page,
    pageSize: ADMIN_WORKSPACES_PAGE_SIZE,
  });
  const storage = await getStorageUsageByWorkspaces(items.map((item) => item.id));
  log.debug(
    { actorId: session.user.id, page: query.page, status: query.status, total },
    '[admin.workspace.list]',
  );
  return {
    items: items.map((item) => ({ ...item, storage: storage.get(item.id) ?? EMPTY_STORAGE })),
    total,
    page: query.page,
    pageCount: Math.ceil(total / ADMIN_WORKSPACES_PAGE_SIZE),
  };
}

export async function getAdminWorkspaceDetail(
  workspaceId: string,
): Promise<AdminWorkspaceDetailDto> {
  const session = await requireAdmin();
  const workspace = await getWorkspaceForAdmin(workspaceId);
  const storage = await getStorageUsageByWorkspaces([workspace.id]);
  log.debug({ actorId: session.user.id, workspaceId }, '[admin.workspace.detail]');
  return { ...workspace, storage: storage.get(workspace.id) ?? EMPTY_STORAGE };
}

/** Архив по решению администратора: пространство пропадает у участников, MCP и интеграций. */
export async function archiveWorkspaceByAdmin(input: { workspaceId: string }): Promise<void> {
  const session = await requireAdmin();
  const { name, changed } = await setWorkspaceArchivedBySystem({
    workspaceId: input.workspaceId,
    archived: true,
    actorId: session.user.id,
  });
  if (!changed) return;
  await recordAuditEvent({
    kind: 'admin.workspace_archived',
    actor: auditActorFromSession(session),
    workspaceId: input.workspaceId,
    data: { workspaceName: name },
  });
}

export async function restoreWorkspaceByAdmin(input: { workspaceId: string }): Promise<void> {
  const session = await requireAdmin();
  const { name, changed } = await setWorkspaceArchivedBySystem({
    workspaceId: input.workspaceId,
    archived: false,
    actorId: session.user.id,
  });
  if (!changed) return;
  await recordAuditEvent({
    kind: 'admin.workspace_restored',
    actor: auditActorFromSession(session),
    workspaceId: input.workspaceId,
    data: { workspaceName: name },
  });
}

/** Удаление навсегда: только из архива и с вводом названия. */
export async function deleteWorkspaceByAdmin(input: DeleteWorkspaceInput): Promise<void> {
  const session = await requireAdmin();
  const actorId = session.user.id;
  const workspace = await getWorkspaceForAdmin(input.workspaceId);
  try {
    assertWorkspaceNameConfirmed(workspace.name, input.confirmName);
  } catch (error) {
    log.warn({ actorId, workspaceId: workspace.id }, '[admin.workspace.delete] name mismatch');
    throw error;
  }
  const { name } = await deleteWorkspaceBySystem({ workspaceId: workspace.id, actorId });
  log.info({ actorId, workspaceId: workspace.id }, '[admin.workspace.delete] deleted');
  // Пространства уже нет: без workspaceId (иначе нарушится FK), название — в снимке.
  await recordAuditEvent({
    kind: 'admin.workspace_deleted',
    actor: auditActorFromSession(session),
    data: { workspaceName: name },
  });
}

export async function transferOwnershipByAdmin(input: TransferOwnershipInput): Promise<void> {
  const session = await requireAdmin();
  const result = await transferWorkspaceOwnership({
    workspaceId: input.workspaceId,
    newOwnerUserId: input.userId,
    demotePreviousOwners: input.demotePreviousOwners,
    actorId: session.user.id,
  });
  await recordAuditEvent({
    kind: 'admin.workspace_owner_changed',
    actor: auditActorFromSession(session),
    targetUserId: input.userId,
    workspaceId: input.workspaceId,
    data: {
      workspaceName: result.workspaceName,
      ownerName: result.ownerName,
      demotedPrevious: result.demotedCount > 0,
    },
  });
}

export async function setStorageQuotaByAdmin(input: SetStorageQuotaInput): Promise<void> {
  const session = await requireAdmin();
  const { name } = await setWorkspaceStorageQuota({
    workspaceId: input.workspaceId,
    quotaMb: input.quotaMb,
    actorId: session.user.id,
  });
  await recordAuditEvent({
    kind: 'admin.workspace_quota_changed',
    actor: auditActorFromSession(session),
    workspaceId: input.workspaceId,
    data: { workspaceName: name, quotaMb: input.quotaMb },
  });
}
