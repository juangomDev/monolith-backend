import { prisma } from '../../config/db.js';
import type { Prisma } from '@prisma/client';

export class TablesRepository {
  async create(data: Prisma.TableRegistryUncheckedCreateInput) {
    return prisma.tableRegistry.create({ data });
  }

  async findAll() {
    return prisma.tableRegistry.findMany({
      include: {
        folder: {
          select: {
            id: true,
            isPrivate: true,
            userId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByShortCode(shortCode: string) {
    return prisma.tableRegistry.findUnique({ where: { shortCode } });
  }

  async findById(id: string) {
    return prisma.tableRegistry.findUnique({ where: { id } });
  }

  async deleteById(id: string) {
    return prisma.tableRegistry.delete({ where: { id } });
  }
}

export const tablesRepository = new TablesRepository();
