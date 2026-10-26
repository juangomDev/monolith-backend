import { prisma } from '../../config/db.js';
import type { Prisma } from '@prisma/client';

export class TablesRepository {
  async create(data: Prisma.TableRegistryCreateInput) {
    return prisma.tableRegistry.create({ data });
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
