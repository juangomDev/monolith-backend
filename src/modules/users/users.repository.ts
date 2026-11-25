import { prisma } from '../../config/db.js';
import type { Prisma, User, Role } from '@prisma/client';

export interface CreateUserInput {
  username: string;
  passwordHash: string;
  role: Role;
  isActive?: boolean;
  createdById?: string;
}

export interface ListUsersFilter {
  createdById?: string;
  includeStructural?: boolean;
  search?: string;
  role?: Role;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

const SAFE_USER_SELECT = {
  id: true,
  username: true,
  role: true,
  tokenVersion: true,
  isActive: true,
  createdById: true,
  createdAt: true,
} as const;

function buildUsersWhere(filter?: ListUsersFilter): Prisma.UserWhereInput | undefined {
  if (!filter) return undefined;
  const conditions: Prisma.UserWhereInput[] = [];

  if (filter.createdById) {
    if (filter.includeStructural === false) {
      conditions.push({ createdById: filter.createdById });
    } else {
      conditions.push({
        OR: [{ createdById: filter.createdById }, { username: 'ai_manager' }],
      });
    }
  }

  if (filter.search) {
    conditions.push({ username: { contains: filter.search, mode: 'insensitive' } });
  }

  if (filter.role) {
    conditions.push({ role: filter.role });
  }

  if (filter.isActive !== undefined) {
    conditions.push({ isActive: filter.isActive });
  }

  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return { AND: conditions };
}

export class UsersRepository {
  async findByUsername(username: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { username } });
  }

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async countAdmins(): Promise<number> {
    return prisma.user.count({ where: { role: 'ADMIN' } });
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

  async listAll(filter?: ListUsersFilter): Promise<Omit<User, 'passwordHash'>[]> {
    const where = buildUsersWhere(filter);
    const hasPagination = filter?.page !== undefined || filter?.limit !== undefined;
    const page = filter?.page && filter.page > 0 ? filter.page : 1;
    const limit = filter?.limit && filter.limit > 0 ? filter.limit : 50;

    return prisma.user.findMany({
      where,
      select: SAFE_USER_SELECT,
      orderBy: { createdAt: 'desc' },
      ...(hasPagination ? { skip: (page - 1) * limit, take: limit } : {}),
    });
  }

  async count(filter?: ListUsersFilter): Promise<number> {
    const where = buildUsersWhere(filter);
    return prisma.user.count({ where });
  }

  async update(id: string, data: Partial<Pick<User, 'passwordHash' | 'isActive' | 'tokenVersion'>>): Promise<User> {
    return prisma.user.update({ where: { id }, data });
  }

  async deleteById(id: string): Promise<User> {
    return prisma.user.delete({ where: { id } });
  }

  async getUserStoragePaths(userId: string): Promise<string[]> {
    const folders = await prisma.folder.findMany({
      where: { userId },
      include: {
        images: { select: { storagePath: true } },
        tables: { select: { storagePath: true } },
        pdfs: { select: { storagePath: true, textArtifactPath: true } },
      },
    });
    const paths: string[] = [];
    for (const folder of folders) {
      for (const img of (folder.images ?? [])) paths.push(img.storagePath);
      for (const tbl of (folder.tables ?? [])) paths.push(tbl.storagePath);
      for (const pdf of (folder.pdfs ?? [])) {
        paths.push(pdf.storagePath);
        if (pdf.textArtifactPath) paths.push(pdf.textArtifactPath);
      }
    }
    return paths;
  }

  async incrementTokenVersion(id: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { tokenVersion: { increment: 1 } },
    });
  }
}

export const usersRepository = new UsersRepository();
