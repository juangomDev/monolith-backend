import { prisma } from '../../config/db.js';
import { AppError } from '../../shared/errors.js';
import fs from 'node:fs/promises';

export class TablesService {
  async getTableByShortCode(shortCode: string) {
    const record = await prisma.tableRegistry.findUnique({
      where: { shortCode },
    });
    if (!record) {
      throw new AppError(404, 'Tabla no encontrada', 'NOT_FOUND');
    }
    return record;
  }

  async deleteTable(id: string) {
    const record = await prisma.tableRegistry.findUnique({
      where: { id },
    });
    if (!record) {
      throw new AppError(404, 'Tabla no encontrada', 'NOT_FOUND');
    }

    await prisma.tableRegistry.delete({
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

export const tablesService = new TablesService();
