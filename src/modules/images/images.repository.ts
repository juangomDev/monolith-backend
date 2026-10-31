import { prisma } from '../../config/db.js';
import type { Prisma } from '@prisma/client';

export class ImagesRepository {
  async create(data: Prisma.ImageRegistryUncheckedCreateInput) {
    return prisma.imageRegistry.create({ data });
  }

  async findAll() {
    return prisma.imageRegistry.findMany({
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
    return prisma.imageRegistry.findUnique({ where: { shortCode } });
  }

  async findById(id: string) {
    return prisma.imageRegistry.findUnique({ where: { id } });
  }

  async deleteById(id: string) {
    return prisma.imageRegistry.delete({ where: { id } });
  }
}

export const imagesRepository = new ImagesRepository();
