import { FolderType, Role, FolderPermission } from '@prisma/client';
import { foldersRepository, type FoldersRepository } from './folders.repository.js';
import { foldersSharesService, type FoldersSharesService } from './folders.shares.service.js';
import { AppError } from '../../shared/errors.js';
import {
  UUID_REGEX,
  moveResourceSchema,
  type RequesterContext,
} from './folders.validation.js';

export class FoldersMovementService {
  constructor(
    private readonly repo: FoldersRepository = foldersRepository,
    private readonly sharesService: FoldersSharesService = foldersSharesService
  ) {}

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
}

export const foldersMovementService = new FoldersMovementService();
