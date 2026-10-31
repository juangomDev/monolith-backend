import { prisma } from '../../config/db.js';
import type { User, Role } from '@prisma/client';

export interface CreateUserInput {
  username: string;
  passwordHash: string;
  role: Role;
  isActive?: boolean;
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
      },
    });
  }

  async listAll(): Promise<Omit<User, 'passwordHash'>[]> {
    return prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        tokenVersion: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
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
