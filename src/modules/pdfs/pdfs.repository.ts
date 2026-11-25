import { prisma } from '../../config/db.js';
import type { Prisma, PdfRegistry, Role } from '@prisma/client';
import { buildResourceFolderVisibilityWhere } from '../../shared/folder-visibility.js';

export interface FindPdfsOptions {
  page?: number;
  limit?: number;
  folderId?: string;
  userId?: string;
  isAdmin?: boolean;
  role?: Role;
  search?: string;
}

function buildPdfWhere(options?: FindPdfsOptions): Prisma.PdfRegistryWhereInput {
  const conditions: Prisma.PdfRegistryWhereInput[] = [];

  if (options?.folderId) {
    conditions.push({ folderId: options.folderId });
  }

  if (options && !options.isAdmin && options.userId) {
    const visibility = buildResourceFolderVisibilityWhere({
      userId: options.userId,
      isAdmin: options.isAdmin,
      role: options.role,
    });
    if (visibility) conditions.push(visibility);
  }

  if (options?.search) {
    conditions.push({
      OR: [
        { originalName: { contains: options.search, mode: 'insensitive' } },
        { shortCode: { contains: options.search, mode: 'insensitive' } },
      ],
    });
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { AND: conditions };
}

export class PdfsRepository {
  async create(data: Prisma.PdfRegistryUncheckedCreateInput): Promise<PdfRegistry> {
    return prisma.pdfRegistry.create({ data });
  }

  async findById(id: string) {
    return prisma.pdfRegistry.findUnique({
      where: { id },
      include: {
        folder: {
          select: { id: true, isPrivate: true, userId: true, name: true },
        },
      },
    });
  }

  async findByShortCode(shortCode: string) {
    return prisma.pdfRegistry.findUnique({
      where: { shortCode },
      include: {
        folder: {
          select: { id: true, isPrivate: true, userId: true, name: true },
        },
      },
    });
  }

  async findAll(options?: FindPdfsOptions): Promise<PdfRegistry[]> {
    const where = buildPdfWhere(options);
    const page = options?.page && options.page > 0 ? options.page : 1;
    const limit = options?.limit && options.limit > 0 ? options.limit : (options ? 50 : undefined);
    const skip = limit ? (page - 1) * limit : undefined;

    return prisma.pdfRegistry.findMany({
      where,
      include: {
        folder: {
          select: { id: true, isPrivate: true, userId: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });
  }

  async count(options?: FindPdfsOptions): Promise<number> {
    const where = buildPdfWhere(options);
    return prisma.pdfRegistry.count({ where });
  }

  async update(id: string, data: Prisma.PdfRegistryUpdateInput): Promise<PdfRegistry> {
    return prisma.pdfRegistry.update({
      where: { id },
      data,
      include: {
        folder: {
          select: { id: true, isPrivate: true, userId: true, name: true },
        },
      },
    });
  }

  async delete(id: string): Promise<PdfRegistry> {
    return prisma.pdfRegistry.delete({ where: { id } });
  }
}

export const pdfsRepository = new PdfsRepository();

