import { FolderPermission, Role, type Folder, type FolderMember } from '@prisma/client';
import { foldersSharesRepository, type FoldersSharesRepository, type FolderMemberWithUser } from './folders.shares.repository.js';
import { foldersRepository, type FoldersRepository } from './folders.repository.js';
import { usersRepository, type UsersRepository } from '../users/users.repository.js';
import { AppError } from '../../shared/errors.js';
import { auditService } from '../audit/audit.service.js';
import type { RequesterContext } from './folders.service.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface FolderAccessResult {
  folder: Folder;
  permission: 'ADMIN' | FolderPermission;
}

export class FoldersSharesService {
  constructor(
    private readonly sharesRepo: FoldersSharesRepository = foldersSharesRepository,
    private readonly foldersRepo: FoldersRepository = foldersRepository,
    private readonly usersRepo: UsersRepository = usersRepository
  ) {}

  async assertFolderAccess(
    folderId: string,
    caller: RequesterContext,
    requiredPermission: FolderPermission = FolderPermission.READ
  ): Promise<FolderAccessResult> {
    if (!UUID_REGEX.test(folderId)) throw new AppError(400, 'El folderId debe ser un UUID válido', 'INVALID_ID');

    const folder = await this.foldersRepo.findFolderById(folderId);
    if (!folder) throw new AppError(404, 'Carpeta no encontrada', 'FOLDER_NOT_FOUND');

    if (caller.role === Role.ADMIN) {
      return { folder, permission: 'ADMIN' };
    }

    if (folder.isSystem) {
      if (requiredPermission === FolderPermission.READ) {
        return { folder, permission: FolderPermission.READ };
      }
      throw new AppError(403, 'La carpeta compartida de sistema es de solo lectura', 'FORBIDDEN');
    }

    if (folder.userId === caller.id) {
      return { folder, permission: FolderPermission.EDIT };
    }

    // Control Supremo del Manager sobre cualquier subcarpeta en su árbol
    if (caller.role === Role.MANAGER && folder.parentId) {
      let currParentId: string | null = folder.parentId;
      while (currParentId) {
        const pFolder = await this.foldersRepo.findFolderById(currParentId);
        if (pFolder && pFolder.userId === caller.id) {
          return { folder, permission: FolderPermission.EDIT };
        }
        currParentId = pFolder?.parentId ?? null;
      }
    }

    const member = await this.sharesRepo.findMember(folderId, caller.id);
    if (member) {
      if (requiredPermission === FolderPermission.READ) {
        return { folder, permission: member.permission };
      }
      if (requiredPermission === FolderPermission.EDIT) {
        if (member.permission === FolderPermission.EDIT) {
          return { folder, permission: FolderPermission.EDIT };
        }
        throw new AppError(403, 'Permiso insuficiente: solo tienes acceso de lectura en esta carpeta', 'FORBIDDEN');
      }
    }

    // Herencia de membresía desde carpeta padre
    if (folder.parentId) {
      let currParentId: string | null = folder.parentId;
      while (currParentId) {
        const parentMember = await this.sharesRepo.findMember(currParentId, caller.id);
        if (parentMember) {
          if (requiredPermission === FolderPermission.READ) {
            return { folder, permission: parentMember.permission };
          }
          if (requiredPermission === FolderPermission.EDIT && parentMember.permission === FolderPermission.EDIT) {
            return { folder, permission: FolderPermission.EDIT };
          }
        }
        const pFolder = await this.foldersRepo.findFolderById(currParentId);
        currParentId = pFolder?.parentId ?? null;
      }
    }

    if (caller.role === Role.COLLABORATOR) {
      throw new AppError(403, 'Esta carpeta no ha sido compartida contigo', 'FORBIDDEN');
    }

    if (folder.isPrivate) {
      throw new AppError(403, 'No tienes permiso para acceder a esta carpeta privada', 'FORBIDDEN');
    }

    if (requiredPermission === FolderPermission.EDIT) {
      throw new AppError(403, 'Solo el propietario de la carpeta o un colaborador con permiso EDIT pueden modificarla', 'FORBIDDEN');
    }

    return { folder, permission: FolderPermission.READ };
  }

  async shareFolder(
    folderId: string,
    caller: RequesterContext,
    targetUserId: string,
    permission: FolderPermission = FolderPermission.READ
  ): Promise<FolderMember> {
    if (!UUID_REGEX.test(folderId)) throw new AppError(400, 'El folderId debe ser un UUID válido', 'INVALID_ID');
    if (!UUID_REGEX.test(targetUserId)) throw new AppError(400, 'El userId debe ser un UUID válido', 'INVALID_ID');

    const folder = await this.foldersRepo.findFolderById(folderId);
    if (!folder) throw new AppError(404, 'Carpeta no encontrada', 'FOLDER_NOT_FOUND');

    if (caller.role !== Role.ADMIN && folder.userId !== caller.id) {
      throw new AppError(403, 'Solo el dueño de la carpeta o un administrador pueden compartirla', 'FORBIDDEN');
    }

    if (folder.userId === targetUserId) {
      throw new AppError(400, 'No puedes compartir una carpeta con su propio dueño', 'BAD_REQUEST');
    }

    const targetUser = await this.usersRepo.findById(targetUserId);
    if (!targetUser) throw new AppError(404, 'El usuario colaborador no existe', 'USER_NOT_FOUND');

    const member = await this.sharesRepo.addOrUpdateMember(folderId, targetUserId, permission);

    auditService.recordLog({
      actorId: caller.id,
      actorUsername: caller.role,
      action: 'FOLDER_SHARE',
      resourceType: 'FOLDER',
      folderId,
      metadata: { targetUserId, permission },
    });

    return member;
  }

  async listShares(folderId: string, caller: RequesterContext): Promise<FolderMemberWithUser[]> {
    if (!UUID_REGEX.test(folderId)) throw new AppError(400, 'El folderId debe ser un UUID válido', 'INVALID_ID');

    const folder = await this.foldersRepo.findFolderById(folderId);
    if (!folder) throw new AppError(404, 'Carpeta no encontrada', 'FOLDER_NOT_FOUND');

    if (caller.role !== Role.ADMIN && folder.userId !== caller.id) {
      const member = await this.sharesRepo.findMember(folderId, caller.id);
      if (!member) throw new AppError(403, 'No tienes permiso para consultar los colaboradores de esta carpeta', 'FORBIDDEN');
    }

    return this.sharesRepo.listMembers(folderId);
  }

  async updateSharePermission(
    folderId: string,
    caller: RequesterContext,
    targetUserId: string,
    permission: FolderPermission
  ): Promise<FolderMember> {
    return this.shareFolder(folderId, caller, targetUserId, permission);
  }

  async revokeShare(folderId: string, caller: RequesterContext, targetUserId: string): Promise<{ revoked: boolean }> {
    if (!UUID_REGEX.test(folderId)) throw new AppError(400, 'El folderId debe ser un UUID válido', 'INVALID_ID');
    if (!UUID_REGEX.test(targetUserId)) throw new AppError(400, 'El userId debe ser un UUID válido', 'INVALID_ID');

    const folder = await this.foldersRepo.findFolderById(folderId);
    if (!folder) throw new AppError(404, 'Carpeta no encontrada', 'FOLDER_NOT_FOUND');

    if (caller.role !== Role.ADMIN && folder.userId !== caller.id) {
      throw new AppError(403, 'Solo el dueño de la carpeta o un administrador pueden revocar accesos', 'FORBIDDEN');
    }

    const member = await this.sharesRepo.findMember(folderId, targetUserId);
    if (!member) throw new AppError(404, 'El colaborador no tiene acceso a esta carpeta', 'MEMBER_NOT_FOUND');

    await this.sharesRepo.removeMember(folderId, targetUserId);

    auditService.recordLog({
      actorId: caller.id,
      actorUsername: caller.role,
      action: 'FOLDER_REVOKE',
      resourceType: 'FOLDER',
      folderId,
      metadata: { targetUserId },
    });

    return { revoked: true };
  }
}

export const foldersSharesService = new FoldersSharesService();
