import { prisma } from '../../config/db.js';
import type { Prisma, ApiClient } from '@prisma/client';

const SAFE_SELECT = {
  id: true,
  name: true,
  description: true,
  keyPrefix: true,
  rateLimit: true,
  isActive: true,
  lastUsedAt: true,
  createdAt: true,
} as const;

export class ApiKeysRepository {
  async create(data: Prisma.ApiClientCreateInput): Promise<ApiClient> {
    return prisma.apiClient.create({ data });
  }

  async findAll(options?: { page?: number; limit?: number }): Promise<Omit<ApiClient, 'keyHash'>[]> {
    const hasPagination = options?.page !== undefined || options?.limit !== undefined;
    const page = options?.page && options.page > 0 ? options.page : 1;
    const limit = options?.limit && options.limit > 0 ? options.limit : 50;

    return prisma.apiClient.findMany({
      select: SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
      ...(hasPagination ? { skip: (page - 1) * limit, take: limit } : {}),
    });
  }

  async count(): Promise<number> {
    return prisma.apiClient.count();
  }

  async findById(id: string): Promise<ApiClient | null> {
    return prisma.apiClient.findUnique({
      where: { id },
    });
  }

  async update(id: string, data: Prisma.ApiClientUpdateInput): Promise<Omit<ApiClient, 'keyHash'>> {
    return prisma.apiClient.update({
      where: { id },
      data,
      select: SAFE_SELECT,
    });
  }

  async deleteById(id: string): Promise<ApiClient> {
    return prisma.apiClient.delete({
      where: { id },
    });
  }
}

export const apiKeysRepository = new ApiKeysRepository();
