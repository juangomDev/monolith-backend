import { z } from 'zod';
import { Role, FolderPermission } from '@prisma/client';
import { imagesRepository } from './images.repository.js';
import { formatImageItem } from './images.service.js';
import { foldersSharesService } from '../folders/folders.shares.service.js';
import { auditService } from '../audit/audit.service.js';
import { AppError } from '../../shared/errors.js';
import type { RequesterContext } from '../folders/folders.service.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ImageMetadataCard {
  title?: string;
  alt?: string;
  description?: string;
  tags?: string[];
  custom?: Record<string, string>;
}

export const updateImageMetadataZodSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  alt: z.string().trim().max(500).optional(),
  description: z.string().trim().max(2000).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
  custom: z.record(z.string(), z.string().max(500)).optional(),
});

export class ImagesMetadataService {
  async updateMetadata(id: string, rawInput: unknown, requester?: RequesterContext) {
    if (!UUID_REGEX.test(id)) {
      throw new AppError(400, 'El ID de la imagen debe ser un UUID válido', 'INVALID_ID');
    }

    const parseResult = updateImageMetadataZodSchema.safeParse(rawInput);
    if (!parseResult.success) {
      const invalidParams = Object.entries(parseResult.error.flatten().fieldErrors).map(([name, errs]) => ({
        name,
        reason: (errs as string[])?.join(', ') || 'Valor inválido',
      }));
      throw new AppError(400, 'Datos de metadatos de imagen inválidos', 'VALIDATION_ERROR', invalidParams);
    }

    const record = await imagesRepository.findById(id);
    if (!record) {
      throw new AppError(404, 'Imagen no encontrada', 'NOT_FOUND');
    }

    if (requester && requester.role !== Role.ADMIN) {
      if (record.folder && record.folder.userId !== requester.id) {
        if (record.folderId) {
          await foldersSharesService.assertFolderAccess(record.folderId, requester, FolderPermission.EDIT);
        } else {
          throw new AppError(403, 'No tienes permiso para modificar los metadatos de esta imagen', 'FORBIDDEN');
        }
      }
    }

    const input = parseResult.data;
    const currentCard: ImageMetadataCard = ((record as any).metadataCard as ImageMetadataCard) || {};
    const updatedCard: ImageMetadataCard = {
      ...currentCard,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.alt !== undefined ? { alt: input.alt } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.custom !== undefined ? { custom: { ...(currentCard.custom || {}), ...input.custom } } : {}),
    };

    const updated = await imagesRepository.update(id, { metadataCard: updatedCard as any });

    auditService.recordLog({
      actorId: requester?.id,
      actorUsername: requester?.role || 'system',
      action: 'IMAGE_METADATA_UPDATE',
      resourceType: 'IMAGE',
      resourceId: id,
      folderId: record.folderId,
    });

    return formatImageItem(updated);
  }
}

export const imagesMetadataService = new ImagesMetadataService();
