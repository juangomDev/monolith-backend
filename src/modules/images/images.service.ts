import path from 'node:path';
import type { MultipartFile } from '@fastify/multipart';
import { Role, FolderType, FolderPermission } from '@prisma/client';
import { env } from '../../config/env.js';
import { generateShortCode } from '../../shared/shortcode.js';
import { AppError } from '../../shared/errors.js';
import { validateMagicBytes, ALLOWED_IMAGE_MIMES } from '../../gateway/file-guard.js';
import { imagesRepository } from './images.repository.js';
import { imagesProcessor } from './images.processor.js';
import { imagesStorage } from './images.storage.js';
import { foldersRepository } from '../folders/folders.repository.js';
import { foldersSharesService } from '../folders/folders.shares.service.js';
import type { RequesterContext } from '../folders/folders.service.js';
import { auditService } from '../audit/audit.service.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ListImagesQueryOptions {
  page?: number; limit?: number; folderId?: string; requester?: RequesterContext; search?: string;
}

export function formatImageItem(record: any) {
  const dateForVersion = record.updatedAt ? new Date(record.updatedAt) : (record.createdAt ? new Date(record.createdAt) : new Date());
  return {
    id: record.id, shortCode: record.shortCode, url: `${env.BASE_URL}/i/${record.shortCode}`,
    urlWithVersion: `${env.BASE_URL}/i/${record.shortCode}?v=${dateForVersion.getTime()}`,
    originalName: record.originalName, mimeType: record.mimeType, sizeBytes: record.sizeBytes,
    width: record.width ?? null, height: record.height ?? null, folderId: (record as any).folderId ?? null,
    createdAt: record.createdAt, updatedAt: record.updatedAt ?? record.createdAt,
  };
}

export class ImagesService {
  async saveImage(part: MultipartFile, folderId?: string, user?: RequesterContext | string) {
    const requesterCtx = typeof user === 'string' ? { id: user, role: Role.ADMIN } : user;
    if (requesterCtx?.role === Role.COLLABORATOR) {
      if (!folderId) {
        throw new AppError(403, 'Los colaboradores solo pueden subir archivos a carpetas compartidas con permiso de edición', 'FORBIDDEN');
      }
      await foldersSharesService.assertFolderAccess(folderId, requesterCtx, FolderPermission.EDIT);
    } else if (folderId && requesterCtx) {
      await foldersSharesService.assertFolderAccess(folderId, requesterCtx, FolderPermission.EDIT);
    }

    const isImage = part.mimetype.startsWith('image/') || part.mimetype === 'image/svg+xml';
    if (!isImage) {
      throw new AppError(415, `Tipo de archivo '${part.mimetype}' no permitido. Solo se aceptan imágenes.`, 'UNSUPPORTED_MEDIA_TYPE');
    }

    const shortCode = generateShortCode();
    let ext = path.extname(part.filename).toLowerCase();
    if (part.mimetype === 'image/svg+xml' || ext === '.svg') {
      ext = '.svg';
    } else if (!ext || ext.length > 5) {
      const subtype = part.mimetype.split('/')[1]?.split('+')[0] || 'jpg';
      ext = `.${subtype === 'jpeg' ? 'jpg' : subtype}`;
    }

    const fileName = `${shortCode}${ext}`;
    const targetPath = imagesStorage.resolvePath(fileName);

    await imagesStorage.saveStream(part.file, targetPath);

    if (part.file.truncated) {
      await imagesStorage.deleteFile(targetPath);
      throw new AppError(413, 'La imagen supera el tamaño máximo permitido', 'PAYLOAD_TOO_LARGE');
    }

    let detectedType = { mime: part.mimetype, ext: ext.replace('.', '') };
    try {
      const chunk = await imagesStorage.readHeaderChunk(targetPath, 4100);
      detectedType = await validateMagicBytes(chunk, ALLOWED_IMAGE_MIMES);
    } catch (valErr) {
      await imagesStorage.deleteFile(targetPath);
      throw valErr;
    }

    const fileSize = await imagesStorage.getFileSize(targetPath);

    // Procesamiento multimedia delegado a imagesProcessor
    const { width, height } = await imagesProcessor.extractDimensions(targetPath);
    await imagesProcessor.generateThumbnail(targetPath, shortCode);

    const userId = requesterCtx?.id;
    if (!folderId && userId) {
      const defaultFolder = await foldersRepository.findOrCreateDefaultFolder(userId, FolderType.IMAGE);
      folderId = defaultFolder.id;
    }

    const record = await imagesRepository.create({
      shortCode,
      originalName: part.filename || 'image',
      mimeType: detectedType.mime,
      sizeBytes: fileSize,
      width,
      height,
      storagePath: targetPath,
      folderId,
    });

    auditService.recordLog({
      actorId: requesterCtx?.id,
      actorUsername: requesterCtx?.role || 'system',
      action: 'IMAGE_UPLOAD',
      resourceType: 'IMAGE',
      resourceId: record.id,
      folderId,
    });

    return formatImageItem(record);
  }

  async listImages(
    options?: ListImagesQueryOptions,
    requester?: RequesterContext
  ) {
    const page = options?.page && options.page > 0 ? options.page : 1;
    const limit = options?.limit && options.limit > 0 ? options.limit : 50;
    const effectiveRequester = requester ?? options?.requester;

    const findOptions = {
      page, limit, folderId: options?.folderId,
      userId: effectiveRequester?.id,
      isAdmin: effectiveRequester?.role === Role.ADMIN,
      search: options?.search,
    };

    const records = await imagesRepository.findAll(findOptions);
    let total = records.length;
    if (options && (options.page !== undefined || options.limit !== undefined || options.folderId !== undefined)) {
      try {
        total = await imagesRepository.count(findOptions);
      } catch {
        total = records.length;
      }
    }

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      images: records.map(formatImageItem),
      total,
      page,
      limit,
      totalPages,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
      },
    };
  }

  async getImageFileByShortCode(shortCode: string, variant: 'thumb' | 'original' = 'original') {
    const record = await imagesRepository.findByShortCode(shortCode);
    if (!record) {
      throw new AppError(404, 'Imagen no encontrada', 'NOT_FOUND');
    }

    if (variant === 'thumb') {
      const thumbPath = imagesProcessor.getThumbnailPath(shortCode);
      const isThumbAccessible = await imagesStorage.isAccessible(thumbPath);
      if (isThumbAccessible) {
        return {
          record,
          fileStream: imagesStorage.createReadStream(thumbPath),
          mimeType: 'image/webp',
          isThumbnail: true,
        };
      }
    }

    const isOriginalAccessible = await imagesStorage.isAccessible(record.storagePath);
    if (!isOriginalAccessible) {
      throw new AppError(404, 'El archivo físico de la imagen no existe en almacenamiento', 'FILE_NOT_FOUND');
    }

    return {
      record,
      fileStream: imagesStorage.createReadStream(record.storagePath),
      mimeType: record.mimeType,
      isThumbnail: false,
    };
  }

  async getImageByShortCode(shortCode: string) {
    const record = await imagesRepository.findByShortCode(shortCode);
    if (!record) {
      throw new AppError(404, 'Imagen no encontrada', 'NOT_FOUND');
    }
    return record;
  }

  private async checkImageAccess(record: any, requester?: RequesterContext) {
    if (requester && requester.role !== Role.ADMIN) {
      if (record.folder && record.folder.userId !== requester.id) {
        if (record.folderId) {
          await foldersSharesService.assertFolderAccess(record.folderId, requester, FolderPermission.EDIT);
        } else {
          throw new AppError(403, 'No tienes permiso para acceder o modificar esta imagen', 'FORBIDDEN');
        }
      }
    }
  }

  async renameImage(id: string, newName: string, requester?: RequesterContext) {
    if (!UUID_REGEX.test(id)) throw new AppError(400, 'El ID de la imagen debe ser un UUID válido', 'INVALID_ID');
    const trimmed = typeof newName === 'string' ? newName.trim() : '';
    if (!trimmed || trimmed.length > 255) throw new AppError(400, 'El nombre original debe tener entre 1 y 255 caracteres', 'INVALID_NAME');

    const record = await imagesRepository.findById(id);
    if (!record) throw new AppError(404, 'Imagen no encontrada', 'NOT_FOUND');
    await this.checkImageAccess(record, requester);

    const updated = await imagesRepository.update(id, { originalName: trimmed });
    auditService.recordLog({ actorId: requester?.id, actorUsername: requester?.role || 'system', action: 'IMAGE_RENAME', resourceType: 'IMAGE', resourceId: id, metadata: { originalName: trimmed } });
    return formatImageItem(updated);
  }

  async replaceImageFile(id: string, part: MultipartFile, requester?: RequesterContext) {
    if (!UUID_REGEX.test(id)) throw new AppError(400, 'El ID de la imagen debe ser un UUID válido', 'INVALID_ID');
    const isImage = part.mimetype.startsWith('image/') || part.mimetype === 'image/svg+xml';
    if (!isImage) throw new AppError(415, `Tipo de archivo '${part.mimetype}' no permitido. Solo se aceptan imágenes.`, 'UNSUPPORTED_MEDIA_TYPE');

    const record = await imagesRepository.findById(id);
    if (!record) throw new AppError(404, 'Imagen no encontrada', 'NOT_FOUND');
    await this.checkImageAccess(record, requester);

    let ext = path.extname(part.filename).toLowerCase();
    if (part.mimetype === 'image/svg+xml' || ext === '.svg') {
      ext = '.svg';
    } else if (!ext || ext.length > 5) {
      const subtype = part.mimetype.split('/')[1]?.split('+')[0] || 'jpg';
      ext = `.${subtype === 'jpeg' ? 'jpg' : subtype}`;
    }

    const fileName = `${record.shortCode}${ext}`;
    const targetPath = imagesStorage.resolvePath(fileName);
    const tempPath = imagesStorage.resolvePath(`temp_${record.shortCode}_${Date.now()}${ext}`);

    await imagesStorage.saveStream(part.file, tempPath);

    if (part.file.truncated) {
      await imagesStorage.deleteFile(tempPath);
      throw new AppError(413, 'La imagen supera el tamaño máximo permitido', 'PAYLOAD_TOO_LARGE');
    }

    let detectedType = { mime: part.mimetype, ext: ext.replace('.', '') };
    try {
      const chunk = await imagesStorage.readHeaderChunk(tempPath, 4100);
      detectedType = await validateMagicBytes(chunk, ALLOWED_IMAGE_MIMES);
    } catch (valErr) {
      await imagesStorage.deleteFile(tempPath);
      throw valErr;
    }

    // Si cambió la extensión física, eliminar el archivo anterior en disco
    if (record.storagePath !== targetPath) {
      await imagesStorage.deleteFile(record.storagePath);
    }

    await imagesStorage.renameFile(tempPath, targetPath);
    const fileSize = await imagesStorage.getFileSize(targetPath);

    // Sharp: Dimensiones y regeneración de miniatura delegadas
    const { width, height } = await imagesProcessor.extractDimensions(targetPath);
    await imagesProcessor.generateThumbnail(targetPath, record.shortCode);

    const updated = await imagesRepository.update(id, {
      storagePath: targetPath,
      mimeType: detectedType.mime,
      sizeBytes: fileSize,
      width,
      height,
    });
    auditService.recordLog({ actorId: requester?.id, actorUsername: requester?.role || 'system', action: 'IMAGE_HOTSWAP', resourceType: 'IMAGE', resourceId: id });

    return formatImageItem(updated);
  }

  async deleteImage(id: string, requester?: RequesterContext) {
    if (!UUID_REGEX.test(id)) throw new AppError(400, 'El ID de la imagen debe ser un UUID válido', 'INVALID_ID');
    const record = await imagesRepository.findById(id);
    if (!record) throw new AppError(404, 'Imagen no encontrada', 'NOT_FOUND');
    await this.checkImageAccess(record, requester);

    await imagesRepository.deleteById(id);
    await imagesStorage.deleteFile(record.storagePath);
    await imagesProcessor.deleteThumbnail(record.shortCode);
    auditService.recordLog({ actorId: requester?.id, actorUsername: requester?.role || 'system', action: 'IMAGE_DELETE', resourceType: 'IMAGE', resourceId: id });
    return { deleted: true };
  }
}

export const imagesService = new ImagesService();
