import { prisma } from '../../config/db.js';
import type { FolderMember, FolderPermission } from '@prisma/client';

export interface FolderMemberWithUser extends FolderMember {
  user: {
    id: string;
    username: string;
    role: string;
  };
}

export class FoldersSharesRepository {
  async findMember(folderId: string, userId: string): Promise<FolderMember | null> {
    return prisma.folderMember.findUnique({
      where: {
        folderId_userId: { folderId, userId },
      },
    });
  }

  async listMembers(folderId: string): Promise<FolderMemberWithUser[]> {
    return prisma.folderMember.findMany({
      where: { folderId },
      include: {
        user: {
          select: { id: true, username: true, role: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addOrUpdateMember(folderId: string, userId: string, permission: FolderPermission): Promise<FolderMember> {
    return prisma.folderMember.upsert({
      where: {
        folderId_userId: { folderId, userId },
      },
      create: {
        folderId,
        userId,
        permission,
      },
      update: {
        permission,
      },
    });
  }

  async removeMember(folderId: string, userId: string): Promise<FolderMember> {
    return prisma.folderMember.delete({
      where: {
        folderId_userId: { folderId, userId },
      },
    });
  }
}

export const foldersSharesRepository = new FoldersSharesRepository();
