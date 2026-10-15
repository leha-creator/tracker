import type { WorkspaceRole } from '@/shared/access/workspace-role';
import { ValidationError } from '@/shared/errors/app-error';

const LAST_OWNER_MESSAGE =
  'В пространстве должен остаться хотя бы один владелец. Сначала назначьте другого владельца.';

/**
 * Участник пространства. Инвариант: в пространстве всегда есть хотя бы один владелец.
 * `ownersCount` — текущее число владельцев пространства.
 */
export class Membership {
  constructor(
    readonly id: string,
    readonly userId: string,
    readonly role: WorkspaceRole,
  ) {}

  get isOwner(): boolean {
    return this.role === 'owner';
  }

  private isLastOwner(ownersCount: number): boolean {
    return this.isOwner && ownersCount <= 1;
  }

  assertCanChangeRole(newRole: WorkspaceRole, ownersCount: number): void {
    if (newRole === this.role) {
      throw new ValidationError('У участника уже эта роль', {
        fieldErrors: { role: ['Роль не изменилась'] },
      });
    }
    if (newRole !== 'owner' && this.isLastOwner(ownersCount)) {
      throw new ValidationError(LAST_OWNER_MESSAGE);
    }
  }

  /** Исключение участника другим участником (владельцем). Себя исключить нельзя — для этого выход. */
  assertCanBeRemovedBy(actorUserId: string, ownersCount: number): void {
    if (actorUserId === this.userId) {
      throw new ValidationError('Чтобы выйти из пространства, используйте «Покинуть пространство»');
    }
    if (this.isLastOwner(ownersCount)) throw new ValidationError(LAST_OWNER_MESSAGE);
  }

  assertCanLeave(ownersCount: number): void {
    if (this.isLastOwner(ownersCount)) throw new ValidationError(LAST_OWNER_MESSAGE);
  }

  /** Права выдаются только участникам: у владельца они есть всегда. */
  assertPermissionsConfigurable(): void {
    if (this.isOwner) throw new ValidationError('У владельца это право есть всегда');
  }
}
