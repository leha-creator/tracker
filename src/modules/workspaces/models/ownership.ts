import type { WorkspaceRole } from '@/shared/access/workspace-role';
import { NotFoundError, ValidationError } from '@/shared/errors/app-error';

/** Участник, которому администратор передаёт владение пространством. */
export interface OwnershipCandidate {
  role: WorkspaceRole;
  isAgent: boolean;
}

/**
 * Новый владелец — участник-человек этого пространства. Уже владельцу владение передаётся только
 * вместе с понижением остальных (иначе ничего не меняется). Итог всегда — хотя бы один владелец:
 * новый владелец остаётся им при любом выборе.
 */
export function assertCanTransferOwnership<T extends OwnershipCandidate>(
  candidate: T | null,
  demotePreviousOwners: boolean,
): asserts candidate is T {
  if (!candidate) throw new NotFoundError('Участник не найден в этом пространстве');
  if (candidate.isAgent) {
    throw new ValidationError('Агент не может быть владельцем пространства');
  }
  if (candidate.role === 'owner' && !demotePreviousOwners) {
    throw new ValidationError('Участник уже владелец пространства');
  }
}
