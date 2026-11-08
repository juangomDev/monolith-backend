import { prisma } from '../../config/db.js';
import type { User, Role } from '@prisma/client';

export interface CreateUserInput {
  username: string;
  passwordHash: string;
  role: Role;
  isActive?: boolean;
  createdById?: string;
}

export class UsersRepository {
  async findByUsername(username: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { username },
    });
  }

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  async countAdmins(): Promise<number> {
    return prisma.user.count({
      where: { role: 'ADMIN' },
    });
  }

  async create(data: CreateUserInput): Promise<User> {
    return prisma.user.create({
      data: {
        username: data.username,
        passwordHash: data.passwordHash,
        role: data.role,
        isActive: data.isActive ?? true,
        createdById: data.createdById ?? null,
      },
    });
  }

  async listAll(filter?: { createdById?: string; includeStructural?: boolean }): Promise<Omit<User, 'passwordHash'>[]> {
    let where: any = undefined;
    if (filter?.createdById) {
      if (filter.includeStructural === false) {
        where = { createdById: filter.createdById };
      } else {
        where = {
          OR: [
            { createdById: filter.createdById },
            { username: 'ai_manager' },
          ],
        };
      }
    }

    return prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        role: true,
        tokenVersion: true,
        isActive: true,
        createdById: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, data: Partial<Pick<User, 'passwordHash' | 'isActive' | 'tokenVersion'>>): Promise<User> {
    return prisma.user.update({
      where: { id },
      data,
    });
  }

  async deleteById(id: string): Promise<User> {
    return prisma.user.delete({
      where: { id },
    });
  }

  async getUserStoragePaths(userId: string): Promise<string[]> {
    const folders = await prisma.folder.findMany({
      where: { userId },
      include: {
        images: { select: { storagePath: true } },
        tables: { select: { storagePath: true } },
      },
    });
    const paths: string[] = [];
    for (const folder of folders) {
      for (const img of (folder.images ?? [])) paths.push(img.storagePath);
      for (const tbl of (folder.tables ?? [])) paths.push(tbl.storagePath);
    }
    return paths;
  }

  async incrementTokenVersion(id: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: {
        tokenVersion: { increment: 1 },
      },
    });
  }
}

export const usersRepository = new UsersRepository();
