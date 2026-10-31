import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import { imagesRepository } from './images.repository.js';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';
import { generateShortCode } from '../../shared/shortcode.js';
import { validateMagicBytes, ALLOWED_IMAGE_MIMES } from '../../gateway/file-guard.js';
import { FolderType, Role } from '@prisma/client';
import { foldersRepository } from '../folders/folders.repository.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ImagesService {
  async saveImage(part: MultipartFile, folderId?: string, userId?: string) {
    if (!part.mimetype.startsWith('image/')) {
      throw new AppError(415, `Tipo de archivo '${part.mimetype}' no permitido. Solo se aceptan imágenes.`, 'UNSUPPORTED_MEDIA_TYPE');
    }

    let ext = path.extname(part.filename).toLowerCase();
    if (!ext || ext.length > 5) {
      const subtype = part.mimetype.split('/')[1]?.split('+')[0] || 'jpg';
      ext = `.${subtype === 'jpeg' ? 'jpg' : subtype}`;
    }

    const shortCode = generateShortCode();
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

    // Validación estricta de Magic Bytes reales
    try {
      const handle = await fs.open(targetPath, 'r');
      const buffer = Buffer.alloc(4100);
      const { bytesRead } = await handle.read(buffer, 0, 4100, 0);
      await handle.close();
      const chunk = buffer.subarray(0, bytesRead);

      await validateMagicBytes(chunk, ALLOWED_IMAGE_MIMES);
    } catch (valErr) {
      await fs.unlink(targetPath).catch(() => {});
      throw valErr;
    }

    const stats = await fs.stat(targetPath);

    if (!folderId && userId) {
      const defaultFolder = await foldersRepository.findOrCreateDefaultFolder(userId, FolderType.IMAGE);
      folderId = defaultFolder.id;
    }

    const record = await imagesRepository.create({
      shortCode,
      originalName: part.filename || 'image',
      mimeType: part.mimetype,
      sizeBytes: stats.size,
      storagePath: targetPath,
      folderId,
    });

    return {
      id: record.id,
      shortCode: record.shortCode,
      url: `${env.BASE_URL}/i/${record.shortCode}`,
      originalName: record.originalName,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      folderId: (record as any).folderId ?? null,
      createdAt: record.createdAt,
    };
  }

  async listImages(requester?: { id: string; role: Role }) {
    const records = await imagesRepository.findAll();
    const filtered = requester && requester.role !== Role.ADMIN
      ? records.filter((r: any) => !r.folder || !r.folder.isPrivate || r.folder.userId === requester.id)
      : records;

    return {
      images: filtered.map((record: any) => ({
        id: record.id,
        shortCode: record.shortCode,
        url: `${env.BASE_URL}/i/${record.shortCode}`,
        originalName: record.originalName,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
        folderId: record.folderId ?? null,
        createdAt: record.createdAt,
      })),
      total: filtered.length,
    };
  }

  async getImageFileByShortCode(shortCode: string) {
    const record = await imagesRepository.findByShortCode(shortCode);
    if (!record) {
      throw new AppError(404, 'Imagen no encontrada', 'NOT_FOUND');
    }

    try {
      await fs.access(record.storagePath, fs.constants.R_OK);
    } catch {
      throw new AppError(404, 'El archivo físico de la imagen no existe en almacenamiento', 'FILE_NOT_FOUND');
    }

    return {
      record,
      fileStream: createReadStream(record.storagePath),
    };
  }

  async getImageByShortCode(shortCode: string) {
    const record = await imagesRepository.findByShortCode(shortCode);
    if (!record) {
      throw new AppError(404, 'Imagen no encontrada', 'NOT_FOUND');
    }
    return record;
  }

  async deleteImage(id: string) {
    if (!UUID_REGEX.test(id)) {
      throw new AppError(400, 'El ID de la imagen debe ser un UUID válido', 'INVALID_ID');
    }

    const record = await imagesRepository.findById(id);
    if (!record) {
      throw new AppError(404, 'Imagen no encontrada', 'NOT_FOUND');
    }

    await imagesRepository.deleteById(id);

    try {
      await fs.unlink(record.storagePath);
    } catch {
      // Ignorar si el archivo físico ya no existía
    }

    return { deleted: true };
  }
}

export const imagesService = new ImagesService();
