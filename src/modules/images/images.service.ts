import { prisma } from '../../config/db.js';
import { AppError } from '../../shared/errors.js';
import fs from 'node:fs/promises';

export class ImagesService {
  async getImageByShortCode(shortCode: string) {
    const record = await prisma.imageRegistry.findUnique({
      where: { shortCode },
    });
    if (!record) {
      throw new AppError(404, 'Imagen no encontrada', 'NOT_FOUND');
    }
    return record;
  }

  async deleteImage(id: string) {
    const record = await prisma.imageRegistry.findUnique({
      where: { id },
    });
    if (!record) {
      throw new AppError(404, 'Imagen no encontrada', 'NOT_FOUND');
    }

    await prisma.imageRegistry.delete({
      where: { id },
    });

    try {
      await fs.unlink(record.storagePath);
    } catch {
      // Ignorar si el archivo físico ya no existía
    }

    return { deleted: true };
  }
}

export const imagesService = new ImagesService();
