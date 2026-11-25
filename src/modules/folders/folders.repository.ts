import { prisma } from '../../config/db.js';
import { Role, FolderPermission, type Folder, type FolderType, type Prisma, type ImageRegistry, type TableRegistry } from '@prisma/client';
import { buildFolderMemberOrConditions } from '../../shared/folder-visibility.js';

export interface CreateFolderInput {
  name: string;
  type: FolderType;
  color?: string;
  isPrivate?: boolean;
  isSystem?: boolean;
  parentId?: string | null;
  userId: string;
}

export interface UpdateFolderInput {
  name?: string;
  color?: string | null;
  isPrivate?: boolean;
  parentId?: string | null;
}

export interface FindFoldersFilter {
  type?: FolderType;
  parentId?: string | null;
  userId?: string;
  isAdmin: boolean;
  role?: Role;
  search?: string;
  page?: number;
  limit?: number;
}

export type FolderWithDetails = Folder & {
  _count: { images: number; tables: number; pdfs?: number };
  user: { id: string; username: string };
  members?: { permission: FolderPermission }[];
  parent?: {
    id: string;
    userId: string;
    parentId: string | null;
    members?: { permission: FolderPermission }[];
    parent?: {
      id: string;
      userId: string;
      members?: { permission: FolderPermission }[];
    } | null;
  } | null;
};

export interface DeletedFolderResult {
  deletedFolder: Folder;
  storagePaths: string[];
}

const BASE_FOLDER_INCLUDE = {
  _count: { select: { images: true, tables: true, pdfs: true } },
  user: { select: { id: true, username: true } },
} as const;

export class FoldersRepository {
  private buildWhereClause(filter: FindFoldersFilter): Prisma.FolderWhereInput {
    const where: Prisma.FolderWhereInput = {};
    if (filter.type) where.type = filter.type;
    if (filter.parentId !== undefined) where.parentId = filter.parentId;
    if (filter.search && filter.search.trim().length > 0) {
      where.name = { contains: filter.search.trim(), mode: 'insensitive' };
    }

    if (!filter.isAdmin) {
      const inherited = filter.userId ? buildFolderMemberOrConditions(filter.userId) : [];
      where.OR =
        filter.role === Role.COLLABORATOR
          ? [{ isSystem: true }, ...inherited]
          : [{ isSystem: true }, { isPrivate: false }, { userId: filter.userId }, ...inherited];
    }

    return where;
  }

  private buildMembersHierarchyInclude(userId?: string) {
    if (!userId) return {};
    const memberSelect = { where: { userId }, select: { permission: true } };
    return {
      members: memberSelect,
      parent: {
        select: {
          id: true,
          userId: true,
          parentId: true,
          members: memberSelect,
          parent: { select: { id: true, userId: true, members: memberSelect } },
        },
      },
    };
  }

  async createFolder(data: CreateFolderInput): Promise<Folder> {
    return prisma.folder.create({
      data: {
        name: data.name,
        type: data.type,
        color: data.color,
        isPrivate: data.isPrivate ?? false,
        isSystem: data.isSystem ?? false,
        parentId: data.parentId ?? null,
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
        ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
      },
      include: BASE_FOLDER_INCLUDE,
    });
  }

  async findFolders(filter: FindFoldersFilter): Promise<FolderWithDetails[]> {
    const where = this.buildWhereClause(filter);
    const skip = filter.page && filter.limit ? (filter.page - 1) * filter.limit : undefined;

    return prisma.folder.findMany({
      where,
      skip,
      take: filter.limit,
      include: { ...BASE_FOLDER_INCLUDE, ...this.buildMembersHierarchyInclude(filter.userId) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async countFolders(filter: FindFoldersFilter): Promise<number> {
    return prisma.folder.count({ where: this.buildWhereClause(filter) });
  }

  async findFolderById(id: string, userId?: string): Promise<FolderWithDetails | null> {
    return prisma.folder.findUnique({
      where: { id },
      include: { ...BASE_FOLDER_INCLUDE, ...this.buildMembersHierarchyInclude(userId) },
    });
  }

  async findOrCreateDefaultFolder(userId: string, type: FolderType): Promise<Folder> {
    const existing = await prisma.folder.findFirst({ where: { userId, type, name: 'General' } });
    if (existing) return existing;
    return prisma.folder.create({ data: { name: 'General', type, isPrivate: false, userId } });
  }

  async deleteFolderWithFiles(id: string): Promise<DeletedFolderResult | null> {
    const folder = await prisma.folder.findUnique({
      where: { id },
      include: {
        images: { select: { id: true, storagePath: true } },
        tables: { select: { id: true, storagePath: true } },
        pdfs: { select: { id: true, storagePath: true, textArtifactPath: true } },
      },
    });
    if (!folder) return null;

    const storagePaths = [
      ...(folder.images || []).map((img) => img.storagePath),
      ...(folder.tables || []).map((tbl) => tbl.storagePath),
      ...(folder.pdfs || []).flatMap((pdf) => [pdf.storagePath, pdf.textArtifactPath]),
    ];

    await prisma.folder.delete({ where: { id } });
    return { deletedFolder: folder, storagePaths };
  }

  async moveImageToFolder(imageId: string, folderId: string): Promise<ImageRegistry> {
    return prisma.imageRegistry.update({ where: { id: imageId }, data: { folderId } });
  }

  async moveTableToFolder(tableId: string, folderId: string): Promise<TableRegistry> {
    return prisma.tableRegistry.update({ where: { id: tableId }, data: { folderId } });
  }

  async movePdfToFolder(pdfId: string, folderId: string) {
    return prisma.pdfRegistry.update({ where: { id: pdfId }, data: { folderId } });
  }

  async findImageById(id: string): Promise<ImageRegistry | null> {
    return prisma.imageRegistry.findUnique({ where: { id } });
  }

  async findTableById(id: string): Promise<TableRegistry | null> {
    return prisma.tableRegistry.findUnique({ where: { id } });
  }

  async findChildFolderIds(parentId: string): Promise<Array<{ id: string }>> {
    return prisma.folder.findMany({ where: { parentId }, select: { id: true } });
  }

  async findPdfById(id: string) {
    return prisma.pdfRegistry.findUnique({ where: { id } });
  }
}

export const foldersRepository = new FoldersRepository();
