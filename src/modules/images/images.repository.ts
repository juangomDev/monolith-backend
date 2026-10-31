import { prisma } from '../../config/db.js';
import type { Prisma } from '@prisma/client';

export interface FindImagesOptions {
  page?: number;
  limit?: number;
  folderId?: string;
  userId?: string;
  isAdmin?: boolean;
}

export class ImagesRepository {
  async create(data: Prisma.ImageRegistryUncheckedCreateInput) {
    return prisma.imageRegistry.create({ data });
  }

  async findAll(options?: FindImagesOptions) {
    const where: Prisma.ImageRegistryWhereInput = {};

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

    return prisma.imageRegistry.findMany({
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

  async count(options?: FindImagesOptions) {
    const where: Prisma.ImageRegistryWhereInput = {};

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

    return prisma.imageRegistry.count({ where });
  }

  async findByShortCode(shortCode: string) {
    return prisma.imageRegistry.findUnique({
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
    return prisma.imageRegistry.findUnique({
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

  async update(id: string, data: Prisma.ImageRegistryUpdateInput) {
    return prisma.imageRegistry.update({
      where: { id },
      data,
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
    return prisma.imageRegistry.delete({ where: { id } });
  }
}

export const imagesRepository = new ImagesRepository();
