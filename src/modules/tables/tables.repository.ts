import { prisma } from '../../config/db.js';
import type { Prisma } from '@prisma/client';

export interface FindTablesOptions {
  page?: number;
  limit?: number;
  folderId?: string;
  userId?: string;
  isAdmin?: boolean;
}

export class TablesRepository {
  async create(data: Prisma.TableRegistryUncheckedCreateInput) {
    return prisma.tableRegistry.create({ data });
  }

  async findAll(options?: FindTablesOptions) {
    const where: Prisma.TableRegistryWhereInput = {};

    if (options?.folderId) {
      where.folderId = options.folderId;
    }

    if (options && !options.isAdmin) {
      where.OR = [
        { folderId: null },
        { folder: { isPrivate: false } },
        { folder: { userId: options.userId } },
      ];
    }

    const page = options?.page && options.page > 0 ? options.page : 1;
    const limit = options?.limit && options.limit > 0 ? options.limit : (options ? 50 : undefined);
    const skip = limit ? (page - 1) * limit : undefined;

    return prisma.tableRegistry.findMany({
      where,
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
      skip,
      take: limit,
    });
  }

  async count(options?: FindTablesOptions) {
    const where: Prisma.TableRegistryWhereInput = {};

    if (options?.folderId) {
      where.folderId = options.folderId;
    }

    if (options && !options.isAdmin) {
      where.OR = [
        { folderId: null },
        { folder: { isPrivate: false } },
        { folder: { userId: options.userId } },
      ];
    }

    return prisma.tableRegistry.count({ where });
  }

  async findByShortCode(shortCode: string) {
    return prisma.tableRegistry.findUnique({
      where: { shortCode },
      include: {
        folder: {
          select: {
            id: true,
            isPrivate: true,
            userId: true,
          },
        },
      },
    });
  }

  async findById(id: string) {
    return prisma.tableRegistry.findUnique({
      where: { id },
      include: {
        folder: {
          select: {
            id: true,
            isPrivate: true,
            userId: true,
          },
        },
      },
    });
  }

  async updateMetadata(id: string, metadataCard: any) {
    return prisma.tableRegistry.update({
      where: { id },
      data: { metadataCard },
      include: {
        folder: {
          select: {
            id: true,
            isPrivate: true,
            userId: true,
          },
        },
      },
    });
  }

  async deleteById(id: string) {
    return prisma.tableRegistry.delete({ where: { id } });
  }
}

export const tablesRepository = new TablesRepository();
