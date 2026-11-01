import { prisma } from '../../config/db.js';
import { Role, FolderPermission, type Folder, type FolderType, type Prisma, type ImageRegistry, type TableRegistry } from '@prisma/client';

export interface CreateFolderInput {
  name: string;
  type: FolderType;
  color?: string;
  isPrivate?: boolean;
  userId: string;
}

export interface UpdateFolderInput {
  name?: string;
  color?: string | null;
  isPrivate?: boolean;
}

export interface FindFoldersFilter {
  type?: FolderType;
  userId?: string;
  isAdmin: boolean;
  role?: Role;
  search?: string;
  page?: number;
  limit?: number;
}

export type FolderWithDetails = Folder & {
  _count: {
    images: number;
    tables: number;
  };
  user: {
    id: string;
    username: string;
  };
  members?: { permission: FolderPermission }[];
};

export interface DeletedFolderResult {
  deletedFolder: Folder;
  storagePaths: string[];
}

export class FoldersRepository {
  private buildWhereClause(filter: FindFoldersFilter): Prisma.FolderWhereInput {
    const where: Prisma.FolderWhereInput = {};

    if (filter.type) {
      where.type = filter.type;
    }

    if (filter.search && filter.search.trim().length > 0) {
      where.name = { contains: filter.search.trim(), mode: 'insensitive' };
    }

    if (!filter.isAdmin) {
      if (filter.role === Role.COLLABORATOR) {
        where.members = { some: { userId: filter.userId } };
      } else {
        where.OR = [
          { isPrivate: false },
          { userId: filter.userId },
          { members: { some: { userId: filter.userId } } },
        ];
      }
    }

    return where;
  }

  async createFolder(data: CreateFolderInput): Promise<Folder> {
    return prisma.folder.create({
      data: {
        name: data.name,
        type: data.type,
        color: data.color,
        isPrivate: data.isPrivate ?? false,
        userId: data.userId,
      },
    });
  }

  async updateFolder(id: string, data: UpdateFolderInput): Promise<FolderWithDetails> {
    return prisma.folder.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.isPrivate !== undefined ? { isPrivate: data.isPrivate } : {}),
      },
      include: {
        _count: {
          select: {
            images: true,
            tables: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });
  }

  async findFolders(filter: FindFoldersFilter): Promise<FolderWithDetails[]> {
    const where = this.buildWhereClause(filter);
    const skip = filter.page && filter.limit ? (filter.page - 1) * filter.limit : undefined;
    const take = filter.limit;

    return prisma.folder.findMany({
      where,
      skip,
      take,
      include: {
        _count: {
          select: {
            images: true,
            tables: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
          },
        },
        members: filter.userId
          ? {
              where: { userId: filter.userId },
              select: { permission: true },
            }
          : undefined,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async countFolders(filter: FindFoldersFilter): Promise<number> {
    const where = this.buildWhereClause(filter);
    return prisma.folder.count({ where });
  }

  async findFolderById(id: string): Promise<FolderWithDetails | null> {
    return prisma.folder.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            images: true,
            tables: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });
  }

  async findOrCreateDefaultFolder(userId: string, type: FolderType): Promise<Folder> {
    const existing = await prisma.folder.findFirst({
      where: {
        userId,
        type,
        name: 'General',
      },
    });

    if (existing) {
      return existing;
    }

    return prisma.folder.create({
      data: {
        name: 'General',
        type,
        isPrivate: false,
        userId,
      },
    });
  }

  async deleteFolderWithFiles(id: string): Promise<DeletedFolderResult | null> {
    const folder = await prisma.folder.findUnique({
      where: { id },
      include: {
        images: { select: { id: true, storagePath: true } },
        tables: { select: { id: true, storagePath: true } },
      },
    });

    if (!folder) {
      return null;
    }

    const storagePaths = [
      ...folder.images.map((img) => img.storagePath),
      ...folder.tables.map((tbl) => tbl.storagePath),
    ];

    await prisma.folder.delete({
      where: { id },
    });

    return {
      deletedFolder: folder,
      storagePaths,
    };
  }

  async moveImageToFolder(imageId: string, folderId: string): Promise<ImageRegistry> {
    return prisma.imageRegistry.update({
      where: { id: imageId },
      data: { folderId },
    });
  }

  async moveTableToFolder(tableId: string, folderId: string): Promise<TableRegistry> {
    return prisma.tableRegistry.update({
      where: { id: tableId },
      data: { folderId },
    });
  }

  async findImageById(id: string): Promise<ImageRegistry | null> {
    return prisma.imageRegistry.findUnique({
      where: { id },
    });
  }

  async findTableById(id: string): Promise<TableRegistry | null> {
    return prisma.tableRegistry.findUnique({
      where: { id },
    });
  }
}

export const foldersRepository = new FoldersRepository();
