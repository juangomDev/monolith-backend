import { prisma } from '../../config/db.js';
import type { Folder, FolderType, Prisma, ImageRegistry, TableRegistry } from '@prisma/client';

export interface CreateFolderInput {
  name: string;
  type: FolderType;
  color?: string;
  isPrivate?: boolean;
  userId: string;
}

export interface FindFoldersFilter {
  type?: FolderType;
  userId?: string;
  isAdmin: boolean;
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
};

export interface DeletedFolderResult {
  deletedFolder: Folder;
  storagePaths: string[];
}

export class FoldersRepository {
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

  async findFolders(filter: FindFoldersFilter): Promise<FolderWithDetails[]> {
    const where: Prisma.FolderWhereInput = {};

    if (filter.type) {
      where.type = filter.type;
    }

    if (!filter.isAdmin) {
      where.OR = [
        { isPrivate: false },
        { userId: filter.userId },
      ];
    }

    return prisma.folder.findMany({
      where,
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
      orderBy: { createdAt: 'desc' },
    });
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
