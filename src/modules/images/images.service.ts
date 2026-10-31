import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import { Role, FolderType } from '@prisma/client';
import { env } from '../../config/env.js';
import { generateShortCode } from '../../shared/shortcode.js';
import { AppError } from '../../shared/errors.js';
import { validateMagicBytes, ALLOWED_IMAGE_MIMES } from '../../gateway/file-guard.js';
import { imagesRepository } from './images.repository.js';
import { imagesProcessor } from './images.processor.js';
import { foldersRepository } from '../folders/folders.repository.js';
import type { RequesterContext } from '../folders/folders.service.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ListImagesQueryOptions {
  page?: number;
  limit?: number;
  folderId?: string;
  requester?: RequesterContext;
}

export class ImagesService {
  async saveImage(part: MultipartFile, folderId?: string, userId?: string) {
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

    const imagesDir = path.resolve(env.STORAGE_DIR, 'images');
    await fs.mkdir(imagesDir, { recursive: true });

    const fileName = `${shortCode}${ext}`;
    const targetPath = path.join(imagesDir, fileName);

    try {
      await pipeline(part.file, createWriteStream(targetPath));
    } catch (streamErr) {
      await fs.unlink(targetPath).catch(() => {});
      throw streamErr;
    }

    if (part.file.truncated) {
      await fs.unlink(targetPath).catch(() => {});
      throw new AppError(413, 'La imagen supera el tamaño máximo permitido', 'PAYLOAD_TOO_LARGE');
    }

    let detectedType = { mime: part.mimetype, ext: ext.replace('.', '') };
    try {
      const handle = await fs.open(targetPath, 'r');
      const buffer = Buffer.alloc(4100);
      const { bytesRead } = await handle.read(buffer, 0, 4100, 0);
      await handle.close();
      const chunk = buffer.subarray(0, bytesRead);

      detectedType = await validateMagicBytes(chunk, ALLOWED_IMAGE_MIMES);
    } catch (valErr) {
      await fs.unlink(targetPath).catch(() => {});
      throw valErr;
    }

    const stats = await fs.stat(targetPath);

    // Procesamiento multimedia delegable a imagesProcessor
    const { width, height } = await imagesProcessor.extractDimensions(targetPath);
    await imagesProcessor.generateThumbnail(targetPath, shortCode);

    if (!folderId && userId) {
      const defaultFolder = await foldersRepository.findOrCreateDefaultFolder(userId, FolderType.IMAGE);
      folderId = defaultFolder.id;
    }

    const record = await imagesRepository.create({
      shortCode,
      originalName: part.filename || 'image',
      mimeType: detectedType.mime,
      sizeBytes: stats.size,
      width,
      height,
      storagePath: targetPath,
      folderId,
    });

    const dateForVersion = record.updatedAt ? new Date(record.updatedAt) : (record.createdAt ? new Date(record.createdAt) : new Date());

    return {
      id: record.id,
      shortCode: record.shortCode,
      url: `${env.BASE_URL}/i/${record.shortCode}`,
      urlWithVersion: `${env.BASE_URL}/i/${record.shortCode}?v=${dateForVersion.getTime()}`,
      originalName: record.originalName,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      width: record.width ?? null,
      height: record.height ?? null,
      folderId: (record as any).folderId ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt ?? record.createdAt,
    };
  }

  async listImages(
    options?: ListImagesQueryOptions,
    requester?: RequesterContext
  ) {
    const page = options?.page && options.page > 0 ? options.page : 1;
    const limit = options?.limit && options.limit > 0 ? options.limit : 50;
    const effectiveRequester = requester ?? options?.requester;

    const findOptions = {
      page,
      limit,
      folderId: options?.folderId,
      userId: effectiveRequester?.id,
      isAdmin: effectiveRequester?.role === Role.ADMIN,
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
      images: records.map((record: any) => ({
        id: record.id,
        shortCode: record.shortCode,
        url: `${env.BASE_URL}/i/${record.shortCode}`,
        urlWithVersion: `${env.BASE_URL}/i/${record.shortCode}?v=${new Date(record.updatedAt || record.createdAt || Date.now()).getTime()}`,
        originalName: record.originalName,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
        width: record.width ?? null,
        height: record.height ?? null,
        folderId: record.folderId ?? null,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt ?? record.createdAt,
      })),
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
      try {
        await fs.access(thumbPath, fs.constants.R_OK);
        return {
          record,
          fileStream: createReadStream(thumbPath),
          mimeType: 'image/webp',
          isThumbnail: true,
        };
      } catch {
        // Si la miniatura aún no existe en disco, fallback al original
      }
    }

    try {
      await fs.access(record.storagePath, fs.constants.R_OK);
    } catch {
      throw new AppError(404, 'El archivo físico de la imagen no existe en almacenamiento', 'FILE_NOT_FOUND');
    }

    return {
      record,
      fileStream: createReadStream(record.storagePath),
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

  async renameImage(id: string, newName: string, requester?: RequesterContext) {
    if (!UUID_REGEX.test(id)) {
      throw new AppError(400, 'El ID de la imagen debe ser un UUID válido', 'INVALID_ID');
    }

    const trimmed = typeof newName === 'string' ? newName.trim() : '';
    if (!trimmed || trimmed.length > 255) {
      throw new AppError(400, 'El nombre original debe tener entre 1 y 255 caracteres', 'INVALID_NAME');
    }

    const record = await imagesRepository.findById(id);
    if (!record) {
      throw new AppError(404, 'Imagen no encontrada', 'NOT_FOUND');
    }

    if (requester && requester.role !== Role.ADMIN) {
      if (!record.folder || record.folder.userId !== requester.id) {
        throw new AppError(403, 'No tienes permiso para modificar esta imagen', 'FORBIDDEN');
      }
    }

    const updated = await imagesRepository.update(id, {
      originalName: trimmed,
    });

    return {
      id: updated.id,
      shortCode: updated.shortCode,
      url: `${env.BASE_URL}/i/${updated.shortCode}`,
      urlWithVersion: `${env.BASE_URL}/i/${updated.shortCode}?v=${updated.updatedAt.getTime()}`,
      originalName: updated.originalName,
      mimeType: updated.mimeType,
      sizeBytes: updated.sizeBytes,
      width: updated.width ?? null,
      height: updated.height ?? null,
      folderId: updated.folderId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async replaceImageFile(id: string, part: MultipartFile, requester?: RequesterContext) {
    if (!UUID_REGEX.test(id)) {
      throw new AppError(400, 'El ID de la imagen debe ser un UUID válido', 'INVALID_ID');
    }

    const isImage = part.mimetype.startsWith('image/') || part.mimetype === 'image/svg+xml';
    if (!isImage) {
      throw new AppError(415, `Tipo de archivo '${part.mimetype}' no permitido. Solo se aceptan imágenes.`, 'UNSUPPORTED_MEDIA_TYPE');
    }

    const record = await imagesRepository.findById(id);
    if (!record) {
      throw new AppError(404, 'Imagen no encontrada', 'NOT_FOUND');
    }

    if (requester && requester.role !== Role.ADMIN) {
      if (!record.folder || record.folder.userId !== requester.id) {
        throw new AppError(403, 'No tienes permiso para modificar esta imagen', 'FORBIDDEN');
      }
    }

    let ext = path.extname(part.filename).toLowerCase();
    if (part.mimetype === 'image/svg+xml' || ext === '.svg') {
      ext = '.svg';
    } else if (!ext || ext.length > 5) {
      const subtype = part.mimetype.split('/')[1]?.split('+')[0] || 'jpg';
      ext = `.${subtype === 'jpeg' ? 'jpg' : subtype}`;
    }

    const imagesDir = path.resolve(env.STORAGE_DIR, 'images');
    const fileName = `${record.shortCode}${ext}`;
    const targetPath = path.join(imagesDir, fileName);

    const tempPath = path.join(imagesDir, `temp_${record.shortCode}_${Date.now()}${ext}`);
    try {
      await pipeline(part.file, createWriteStream(tempPath));
    } catch (streamErr) {
      await fs.unlink(tempPath).catch(() => {});
      throw streamErr;
    }

    if (part.file.truncated) {
      await fs.unlink(tempPath).catch(() => {});
      throw new AppError(413, 'La imagen supera el tamaño máximo permitido', 'PAYLOAD_TOO_LARGE');
    }

    let detectedType = { mime: part.mimetype, ext: ext.replace('.', '') };
    try {
      const handle = await fs.open(tempPath, 'r');
      const buffer = Buffer.alloc(4100);
      const { bytesRead } = await handle.read(buffer, 0, 4100, 0);
      await handle.close();
      const chunk = buffer.subarray(0, bytesRead);

      detectedType = await validateMagicBytes(chunk, ALLOWED_IMAGE_MIMES);
    } catch (valErr) {
      await fs.unlink(tempPath).catch(() => {});
      throw valErr;
    }

    // Si cambió la extensión física, eliminar el archivo anterior en disco
    if (record.storagePath !== targetPath) {
      await fs.unlink(record.storagePath).catch(() => {});
    }

    await fs.rename(tempPath, targetPath);
    const stats = await fs.stat(targetPath);

    // Sharp: Dimensiones y regeneración de miniatura delegadas
    const { width, height } = await imagesProcessor.extractDimensions(targetPath);
    await imagesProcessor.generateThumbnail(targetPath, record.shortCode);

    const updated = await imagesRepository.update(id, {
      storagePath: targetPath,
      mimeType: detectedType.mime,
      sizeBytes: stats.size,
      width,
      height,
    });

    return {
      id: updated.id,
      shortCode: updated.shortCode,
      url: `${env.BASE_URL}/i/${updated.shortCode}`,
      urlWithVersion: `${env.BASE_URL}/i/${updated.shortCode}?v=${updated.updatedAt.getTime()}`,
      originalName: updated.originalName,
      mimeType: updated.mimeType,
      sizeBytes: updated.sizeBytes,
      width: updated.width ?? null,
      height: updated.height ?? null,
      folderId: updated.folderId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async deleteImage(id: string, requester?: RequesterContext) {
    if (!UUID_REGEX.test(id)) {
      throw new AppError(400, 'El ID de la imagen debe ser un UUID válido', 'INVALID_ID');
    }

    const record = await imagesRepository.findById(id);
    if (!record) {
      throw new AppError(404, 'Imagen no encontrada', 'NOT_FOUND');
    }

    // Validación Anti-IDOR de Autorización
    if (requester && requester.role !== Role.ADMIN) {
      if (!record.folder || record.folder.userId !== requester.id) {
        throw new AppError(403, 'No tienes permiso para eliminar esta imagen', 'FORBIDDEN');
      }
    }

    await imagesRepository.deleteById(id);

    try {
      await fs.unlink(record.storagePath);
    } catch {
      // Ignorar si el archivo físico ya no existía
    }

    // Limpieza de miniatura asociada delegada a imagesProcessor
    await imagesProcessor.deleteThumbnail(record.shortCode);

    return { deleted: true };
  }
}

export const imagesService = new ImagesService();
