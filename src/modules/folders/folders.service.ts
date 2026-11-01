import fs from 'node:fs/promises';
import path from 'node:path';
import { FolderType, Role, FolderPermission, type Folder } from '@prisma/client';
import { foldersRepository, type FoldersRepository, type FolderWithDetails } from './folders.repository.js';
import { foldersSharesService, type FoldersSharesService } from './folders.shares.service.js';
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
  constructor(
    private readonly repo: FoldersRepository = foldersRepository,
    private readonly sharesService: FoldersSharesService = foldersSharesService
  ) {}

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
      itemCount: folder.type === FolderType.IMAGE ? imagesCount : tablesCount,
      userId: folder.userId,
      owner: folder.user ? { id: folder.user.id, username: folder.user.username } : undefined,
      myPermission,
      createdAt: folder.createdAt,
    };
  }

  async createFolder(rawInput: unknown, requester: RequesterContext): Promise<FormattedFolder> {
    if (requester.role === Role.COLLABORATOR) {
      throw new AppError(403, 'Los colaboradores no tienen permiso para crear carpetas en el sistema', 'FORBIDDEN');
    }

    const parseResult = createFolderSchema.safeParse(rawInput);
    if (!parseResult.success) {
      throw new AppError(
        400,
        parseResult.error.issues[0]?.message || 'Datos de carpeta inválidos',
        'BAD_REQUEST',
        parseResult.error.issues.map((i) => ({ name: i.path.join('.'), reason: i.message }))
      );
    }

    const { name, type, color, isPrivate } = parseResult.data;
    const created = await this.repo.createFolder({
      name,
      type,
      color: color ?? undefined,
      isPrivate: isPrivate ?? false,
      userId: requester.id,
    });

    return {
      id: created.id,
      name: created.name,
      type: created.type,
      color: created.color ?? null,
      isPrivate: created.isPrivate,
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

    const updated = await this.repo.updateFolder(id, parseResult.data);
    return this.formatFolder(updated, requester);
  }

  async listFolders(
    requester: RequesterContext,
    optionsOrType?: FolderType | ListFoldersQueryOptions
  ) {
    const isAdmin = requester.role === Role.ADMIN;
    let type: FolderType | undefined;
    let search: string | undefined;
    let page: number | undefined;
    let limit: number | undefined;

    if (typeof optionsOrType === 'string') {
      type = optionsOrType;
    } else if (typeof optionsOrType === 'object' && optionsOrType !== null) {
      type = optionsOrType.type;
      search = optionsOrType.search;
      page = optionsOrType.page && optionsOrType.page > 0 ? optionsOrType.page : undefined;
      limit = optionsOrType.limit && optionsOrType.limit > 0 ? optionsOrType.limit : undefined;
    }

    const filter = {
      type,
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
        if (filePath.includes('tables')) {
          const parsed = path.parse(filePath);
          paths.push(path.join(parsed.dir, `${parsed.name}.data.json.gz`));
        }
        return paths.map((p) => fs.unlink(p).catch(() => {}));
      })
    );

    return {
      message: 'Carpeta y archivos asociados eliminados exitosamente',
      deletedCount: deleteResult.storagePaths.length,
    };
  }

  async moveImageToFolder(imageId: string, rawInput: unknown, requester: RequesterContext) {
    if (!UUID_REGEX.test(imageId)) {
      throw new AppError(404, 'Imagen no encontrada', 'NOT_FOUND');
    }

    const parseResult = moveResourceSchema.safeParse(rawInput);
    if (!parseResult.success) {
      throw new AppError(400, parseResult.error.issues[0]?.message || 'El folderId destino es inválido', 'BAD_REQUEST');
    }

    const { folderId } = parseResult.data;

    const image = await this.repo.findImageById(imageId);
    if (!image) {
      throw new AppError(404, 'Imagen no encontrada', 'NOT_FOUND');
    }

    const targetFolder = await this.repo.findFolderById(folderId);
    if (!targetFolder) {
      throw new AppError(404, 'Carpeta destino no encontrada', 'NOT_FOUND');
    }

    if (targetFolder.type !== FolderType.IMAGE) {
      throw new AppError(400, "Incompatibilidad de tipos: Las imágenes solo pueden moverse a carpetas de tipo 'IMAGE'", 'INVALID_FOLDER_TYPE');
    }

    if (requester.role === Role.ADMIN || targetFolder.userId === requester.id) {
      // Propietario o ADMIN tienen acceso de edición directo
    } else if (targetFolder.isPrivate && requester.role !== Role.COLLABORATOR) {
      throw new AppError(403, 'No tienes permiso para mover archivos a esta carpeta privada', 'FORBIDDEN');
    } else {
      await this.sharesService.assertFolderAccess(folderId, requester, FolderPermission.EDIT);
    }

    const updated = await this.repo.moveImageToFolder(imageId, folderId);
    return {
      id: updated.id,
      shortCode: updated.shortCode,
      folderId: updated.folderId,
      originalName: updated.originalName,
      mimeType: updated.mimeType,
      sizeBytes: updated.sizeBytes,
    };
  }

  async moveTableToFolder(tableId: string, rawInput: unknown, requester: RequesterContext) {
    if (!UUID_REGEX.test(tableId)) {
      throw new AppError(404, 'Tabla no encontrada', 'NOT_FOUND');
    }

    const parseResult = moveResourceSchema.safeParse(rawInput);
    if (!parseResult.success) {
      throw new AppError(400, parseResult.error.issues[0]?.message || 'El folderId destino es inválido', 'BAD_REQUEST');
    }

    const { folderId } = parseResult.data;

    const table = await this.repo.findTableById(tableId);
    if (!table) {
      throw new AppError(404, 'Tabla no encontrada', 'NOT_FOUND');
    }

    const targetFolder = await this.repo.findFolderById(folderId);
    if (!targetFolder) {
      throw new AppError(404, 'Carpeta destino no encontrada', 'NOT_FOUND');
    }

    if (targetFolder.type !== FolderType.TABLE) {
      throw new AppError(400, "Incompatibilidad de tipos: Las tablas solo pueden moverse a carpetas de tipo 'TABLE'", 'INVALID_FOLDER_TYPE');
    }

    if (requester.role === Role.ADMIN || targetFolder.userId === requester.id) {
      // Propietario o ADMIN tienen acceso de edición directo
    } else if (targetFolder.isPrivate && requester.role !== Role.COLLABORATOR) {
      throw new AppError(403, 'No tienes permiso para mover archivos a esta carpeta privada', 'FORBIDDEN');
    } else {
      await this.sharesService.assertFolderAccess(folderId, requester, FolderPermission.EDIT);
    }

    const updated = await this.repo.moveTableToFolder(tableId, folderId);
    return {
      id: updated.id,
      shortCode: updated.shortCode,
      folderId: updated.folderId,
      tableName: updated.tableName,
      rowCount: updated.rowCount,
      sizeBytes: updated.sizeBytes,
    };
  }

  async getOrCreateDefaultFolder(userId: string, type: FolderType): Promise<Folder> {
    return this.repo.findOrCreateDefaultFolder(userId, type);
  }
}

export const foldersService = new FoldersService();
