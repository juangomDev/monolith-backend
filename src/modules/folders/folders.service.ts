import fs from 'node:fs/promises';
import { z } from 'zod';
import { FolderType, Role, type Folder } from '@prisma/client';
import { foldersRepository, type FoldersRepository, type FolderWithDetails } from './folders.repository.js';
import { AppError } from '../../shared/errors.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const createFolderSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(60, 'El nombre no puede exceder 60 caracteres'),
  type: z.enum(['IMAGE', 'TABLE']),
  color: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'El color debe ser un código hexadecimal válido (ej. #3b82f6)')
    .optional()
    .nullable(),
  isPrivate: z.boolean().optional().default(false),
});

export const moveResourceSchema = z.object({
  folderId: z
    .string()
    .uuid('El folderId debe ser un UUID válido'),
});

export interface RequesterContext {
  id: string;
  role: Role;
}

export interface FormattedFolder {
  id: string;
  name: string;
  type: FolderType;
  color: string | null;
  isPrivate: boolean;
  itemCount: number;
  userId: string;
  owner?: {
    id: string;
    username: string;
  };
  createdAt: Date;
}

export class FoldersService {
  constructor(private readonly repo: FoldersRepository = foldersRepository) {}

  private formatFolder(folder: FolderWithDetails | (Folder & { _count?: { images: number; tables: number }; user?: { id: string; username: string } })): FormattedFolder {
    const imagesCount = folder._count?.images ?? 0;
    const tablesCount = folder._count?.tables ?? 0;

    return {
      id: folder.id,
      name: folder.name,
      type: folder.type,
      color: folder.color ?? null,
      isPrivate: folder.isPrivate,
      itemCount: folder.type === FolderType.IMAGE ? imagesCount : tablesCount,
      userId: folder.userId,
      owner: folder.user ? { id: folder.user.id, username: folder.user.username } : undefined,
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
        parseResult.error.issues.map((i) => ({
          name: i.path.join('.'),
          reason: i.message,
        }))
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
      createdAt: created.createdAt,
    };
  }

  async listFolders(requester: RequesterContext, type?: FolderType): Promise<{ folders: FormattedFolder[]; total: number }> {
    const isAdmin = requester.role === Role.ADMIN;
    const folders = await this.repo.findFolders({
      type,
      userId: requester.id,
      isAdmin,
    });

    const formatted = folders.map((f) => this.formatFolder(f));
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

    // Regla de privacidad: si es privada, solo el dueño o ADMIN pueden verla
    if (folder.isPrivate && requester.role !== Role.ADMIN && folder.userId !== requester.id) {
      throw new AppError(403, 'Acceso denegado a esta carpeta privada', 'FORBIDDEN');
    }

    return this.formatFolder(folder);
  }

  async deleteFolder(id: string, requester: RequesterContext): Promise<{ message: string; deletedCount: number }> {
    if (!UUID_REGEX.test(id)) {
      throw new AppError(404, 'Carpeta no encontrada', 'NOT_FOUND');
    }

    const folder = await this.repo.findFolderById(id);
    if (!folder) {
      throw new AppError(404, 'Carpeta no encontrada', 'NOT_FOUND');
    }

    // Regla de privacidad: Solo el propietario o ADMIN pueden borrar
    if (requester.role !== Role.ADMIN && folder.userId !== requester.id) {
      throw new AppError(403, 'No tienes permiso para eliminar esta carpeta', 'FORBIDDEN');
    }

    const deleteResult = await this.repo.deleteFolderWithFiles(id);
    if (!deleteResult) {
      throw new AppError(404, 'Carpeta no encontrada', 'NOT_FOUND');
    }

    // Eliminación en cascada física de archivos en disco
    await Promise.allSettled(
      deleteResult.storagePaths.map((filePath) =>
        fs.unlink(filePath).catch(() => {})
      )
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
      throw new AppError(
        400,
        parseResult.error.issues[0]?.message || 'El folderId destino es inválido',
        'BAD_REQUEST'
      );
    }

    const { folderId } = parseResult.data;

    // Verificar que la imagen existe
    const image = await this.repo.findImageById(imageId);
    if (!image) {
      throw new AppError(404, 'Imagen no encontrada', 'NOT_FOUND');
    }

    // Verificar que la carpeta destino existe
    const targetFolder = await this.repo.findFolderById(folderId);
    if (!targetFolder) {
      throw new AppError(404, 'Carpeta destino no encontrada', 'NOT_FOUND');
    }

    // Validar tipo cruzado
    if (targetFolder.type !== FolderType.IMAGE) {
      throw new AppError(
        400,
        "Incompatibilidad de tipos: Las imágenes solo pueden moverse a carpetas de tipo 'IMAGE'",
        'INVALID_FOLDER_TYPE'
      );
    }

    // Validar privacidad de la carpeta destino
    if (targetFolder.isPrivate && requester.role !== Role.ADMIN && targetFolder.userId !== requester.id) {
      throw new AppError(403, 'No tienes permiso para mover archivos a esta carpeta privada', 'FORBIDDEN');
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
      throw new AppError(
        400,
        parseResult.error.issues[0]?.message || 'El folderId destino es inválido',
        'BAD_REQUEST'
      );
    }

    const { folderId } = parseResult.data;

    // Verificar que la tabla existe
    const table = await this.repo.findTableById(tableId);
    if (!table) {
      throw new AppError(404, 'Tabla no encontrada', 'NOT_FOUND');
    }

    // Verificar que la carpeta destino existe
    const targetFolder = await this.repo.findFolderById(folderId);
    if (!targetFolder) {
      throw new AppError(404, 'Carpeta destino no encontrada', 'NOT_FOUND');
    }

    // Validar tipo cruzado
    if (targetFolder.type !== FolderType.TABLE) {
      throw new AppError(
        400,
        "Incompatibilidad de tipos: Las tablas solo pueden moverse a carpetas de tipo 'TABLE'",
        'INVALID_FOLDER_TYPE'
      );
    }

    // Validar privacidad de la carpeta destino
    if (targetFolder.isPrivate && requester.role !== Role.ADMIN && targetFolder.userId !== requester.id) {
      throw new AppError(403, 'No tienes permiso para mover archivos a esta carpeta privada', 'FORBIDDEN');
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
