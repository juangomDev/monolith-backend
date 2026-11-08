import { prisma } from '../../config/db.js';
import type { Prisma, ApiClient } from '@prisma/client';

export class ApiKeysRepository {
  async create(data: Prisma.ApiClientCreateInput): Promise<ApiClient> {
    return prisma.apiClient.create({ data });
  }

  async findAll(): Promise<Omit<ApiClient, 'keyHash'>[]> {
    return prisma.apiClient.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        keyPrefix: true,
        rateLimit: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<ApiClient | null> {
    return prisma.apiClient.findUnique({
      where: { id },
    });
  }

  async deleteById(id: string): Promise<ApiClient> {
    return prisma.apiClient.delete({
      where: { id },
    });
  }
}

export const apiKeysRepository = new ApiKeysRepository();

