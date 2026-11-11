import fs from 'node:fs/promises';
import path from 'node:path';
import { FolderType, Role, FolderPermission, type Folder } from '@prisma/client';
import { foldersRepository, type FoldersRepository, type FolderWithDetails } from './folders.repository.js';
import { foldersSharesService, type FoldersSharesService } from './folders.shares.service.js';
import { foldersMovementService, FoldersMovementService } from './folders.movement.service.js';
import { FoldersHierarchyService } from './folders.hierarchy.service.js';
import { AppError } from '../../shared/errors.js';
import {
  UUID_REGEX,
  createFolderSchema,
  updateFolderSchema,
  moveResourceSchema,
  type RequesterContext,
  type FormattedFolder,
  type ListFoldersQueryOptions,
} from './folders.validation.js';

export {
  createFolderSchema,
  updateFolderSchema,
  moveResourceSchema,
  type RequesterContext,
  type FormattedFolder,
  type ListFoldersQueryOptions,
};

export class FoldersService {
  private readonly movementService: FoldersMovementService;
  private readonly hierarchyService: FoldersHierarchyService;

  constructor(
    private readonly repo: FoldersRepository = foldersRepository,
    private readonly sharesService: FoldersSharesService = foldersSharesService,
    movementService?: FoldersMovementService,
    hierarchyService?: FoldersHierarchyService
  ) {
    this.movementService = movementService ?? new FoldersMovementService(this.repo, this.sharesService);
    this.hierarchyService = hierarchyService ?? new FoldersHierarchyService(this.repo, this.sharesService);
  }

  private formatFolder(
    folder: FolderWithDetails | (Folder & { _count?: { images: number; tables: number }; user?: { id: string; username: string }; members?: { permission: string }[] }),
    requester?: RequesterContext
  ): FormattedFolder {
    const imagesCount = folder._count?.images ?? 0;
    const tablesCount = folder._count?.tables ?? 0;
    let myPermission: string | undefined;
    if (requester) {
      if (requester.role === Role.ADMIN) myPermission = 'ADMIN';
      else if (folder.userId === requester.id) myPermission = 'EDIT';
      else if ((folder as any).members?.[0]?.permission) myPermission = (folder as any).members[0].permission;
      else if (!folder.isPrivate) myPermission = 'READ';
    }

    return {
      id: folder.id,
      name: folder.name,
      type: folder.type,
      color: folder.color ?? null,
      isPrivate: folder.isPrivate,
      isSystem: (folder as any).isSystem ?? false,
      parentId: (folder as any).parentId ?? null,
      itemCount: folder.type === FolderType.IMAGE ? imagesCount : tablesCount,
      userId: folder.userId,
      owner: folder.user ? { id: folder.user.id, username: folder.user.username } : undefined,
      myPermission,
      createdAt: folder.createdAt,
    };
  }

  async createFolder(rawInput: unknown, requester: RequesterContext): Promise<FormattedFolder> {
    const parseResult = createFolderSchema.safeParse(rawInput);
    if (!parseResult.success) {
      throw new AppError(
        400,
        parseResult.error.issues[0]?.message || 'Datos de carpeta inválidos',
        'BAD_REQUEST',
        parseResult.error.issues.map((i) => ({ name: i.path.join('.'), reason: i.message }))
      );
    }

    const { name, type, color, isPrivate, parentId } = parseResult.data;
    const { targetUserId } = await this.hierarchyService.validateAndResolveHierarchy(parentId, type, requester);

    const created = await this.repo.createFolder({
      name,
      type,
      color: color ?? undefined,
      isPrivate: isPrivate ?? false,
      parentId: parentId ?? null,
      userId: targetUserId,
    });

    return {
      id: created.id,
      name: created.name,
      type: created.type,
      color: created.color ?? null,
      isPrivate: created.isPrivate,
      isSystem: (created as any).isSystem ?? false,
      parentId: (created as any).parentId ?? null,
      itemCount: 0,
      userId: created.userId,
      myPermission: 'EDIT',
      createdAt: created.createdAt,
    };
  }

  async updateFolder(id: string, rawInput: unknown, requester: RequesterContext): Promise<FormattedFolder> {
    if (!UUID_REGEX.test(id)) {
      throw new AppError(404, 'Carpeta no encontrada', 'NOT_FOUND');
    }

    const parseResult = updateFolderSchema.safeParse(rawInput);
    if (!parseResult.success) {
      throw new AppError(
        400,
        parseResult.error.issues[0]?.message || 'Datos de actualización inválidos',
        'BAD_REQUEST',
        parseResult.error.issues.map((i) => ({ name: i.path.join('.'), reason: i.message }))
      );
    }

    const folder = await this.repo.findFolderById(id);
    if (!folder) {
      throw new AppError(404, 'Carpeta no encontrada', 'NOT_FOUND');
    }

    if (requester.role !== Role.ADMIN && folder.userId !== requester.id) {
      throw new AppError(403, 'No tienes permiso para modificar esta carpeta', 'FORBIDDEN');
    }

    if (folder.name === 'General' && parseResult.data.name && parseResult.data.name !== 'General') {
      throw new AppError(400, 'No se permite cambiar el nombre de la carpeta General del sistema', 'BAD_REQUEST');
    }

    if ((folder as any).isSystem) {
      throw new AppError(400, 'No se permite cambiar el nombre o modificar la carpeta de sistema', 'CANNOT_MODIFY_SYSTEM_FOLDER');
    }

    const updated = await this.repo.updateFolder(id, parseResult.data);
    return this.formatFolder(updated, requester);
  }

  async listFolders(
    requester: RequesterContext,
    optionsOrType?: FolderType | ListFoldersQueryOptions
  ) {
    const isAdmin = requester.role === Role.ADMIN;
    let type: FolderType | undefined;
    let parentId: string | null | undefined;
    let search: string | undefined;
    let page: number | undefined;
    let limit: number | undefined;

    if (typeof optionsOrType === 'string') {
      type = optionsOrType;
    } else if (typeof optionsOrType === 'object' && optionsOrType !== null) {
      type = optionsOrType.type;
      parentId = optionsOrType.parentId;
      search = optionsOrType.search;
      page = optionsOrType.page && optionsOrType.page > 0 ? optionsOrType.page : undefined;
      limit = optionsOrType.limit && optionsOrType.limit > 0 ? optionsOrType.limit : undefined;
    }

    const filter = {
      type,
      parentId,
      search,
      page,
      limit,
      userId: requester.id,
      isAdmin,
      role: requester.role,
    };

    const folders = await this.repo.findFolders(filter);
    const formatted = folders.map((f) => this.formatFolder(f, requester));

    if (page !== undefined || limit !== undefined) {
      const activeLimit = limit ?? 50;
      const activePage = page ?? 1;
      const total = await this.repo.countFolders(filter);
      const totalPages = Math.ceil(total / activeLimit) || 1;
      return {
        folders: formatted,
        total,
        page: activePage,
        limit: activeLimit,
        totalPages,
        meta: {
          page: activePage,
          limit: activeLimit,
          total,
          totalPages,
          hasNext: activePage < totalPages,
        },
      };
    }

    return {
      folders: formatted,
      total: formatted.length,
    };
  }

  async getFolderById(id: string, requester: RequesterContext): Promise<FormattedFolder> {
    if (!UUID_REGEX.test(id)) {
      throw new AppError(404, 'Carpeta no encontrada', 'NOT_FOUND');
    }

    const folder = await this.repo.findFolderById(id);
    if (!folder) {
      throw new AppError(404, 'Carpeta no encontrada', 'NOT_FOUND');
    }

    if (folder.isPrivate && requester.role !== Role.ADMIN && folder.userId !== requester.id) {
      throw new AppError(403, 'Acceso denegado a esta carpeta privada', 'FORBIDDEN');
    }

    return this.formatFolder(folder, requester);
  }

  async deleteFolder(id: string, requester: RequesterContext): Promise<{ message: string; deletedCount: number }> {
    if (!UUID_REGEX.test(id)) {
      throw new AppError(404, 'Carpeta no encontrada', 'NOT_FOUND');
    }

    const folder = await this.repo.findFolderById(id);
    if (!folder) {
      throw new AppError(404, 'Carpeta no encontrada', 'NOT_FOUND');
    }

    if (folder.name === 'General') {
      throw new AppError(400, 'No se permite eliminar la carpeta General del sistema', 'BAD_REQUEST');
    }

    if ((folder as any).isSystem) {
      throw new AppError(400, 'No se permite eliminar carpetas de sistema', 'CANNOT_MODIFY_SYSTEM_FOLDER');
    }

    if (requester.role !== Role.ADMIN && folder.userId !== requester.id) {
      throw new AppError(403, 'No tienes permiso para eliminar esta carpeta', 'FORBIDDEN');
    }

    const deleteResult = await this.repo.deleteFolderWithFiles(id);
    if (!deleteResult) {
      throw new AppError(404, 'Carpeta no encontrada', 'NOT_FOUND');
    }

    await Promise.allSettled(
      deleteResult.storagePaths.flatMap((filePath) => {
        const paths = [filePath];
        const parsed = path.parse(filePath);
        if (filePath.includes('tables')) {
          paths.push(path.join(parsed.dir, `${parsed.name}.data.json.gz`));
        } else if (filePath.includes('images')) {
          paths.push(path.join(parsed.dir, 'thumbs', `${parsed.name}.webp`));
        }
        return paths.map((p) => fs.unlink(p).catch(() => {}));
      })
    );

    return {
      message: 'Carpeta y archivos asociados eliminados exitosamente',
      deletedCount: deleteResult.storagePaths.length,
    };
  }

  async getFolderTree(requester: RequesterContext) {
    const listResult = await this.listFolders(requester, { limit: 1000 });
    return {
      tree: this.hierarchyService.buildTree(listResult.folders),
      total: listResult.folders.length,
    };
  }

  async moveImageToFolder(imageId: string, rawInput: unknown, requester: RequesterContext) {
    return this.movementService.moveImageToFolder(imageId, rawInput, requester);
  }

  async moveTableToFolder(tableId: string, rawInput: unknown, requester: RequesterContext) {
    return this.movementService.moveTableToFolder(tableId, rawInput, requester);
  }

  async getOrCreateDefaultFolder(userId: string, type: FolderType): Promise<Folder> {
    return this.repo.findOrCreateDefaultFolder(userId, type);
  }
}

export const foldersService = new FoldersService();
