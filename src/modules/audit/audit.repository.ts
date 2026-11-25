import { prisma } from '../../config/db.js';
import type { Prisma, AuditLog } from '@prisma/client';

export interface FindAuditLogsOptions {
  page?: number;
  limit?: number;
  action?: string;
  resourceType?: string;
  folderId?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
  search?: string;
  managerScope?: {
    ownFolderIds: string[];
    collaboratorIds: string[];
    managerId: string;
  };
}

export class AuditRepository {
  async create(data: Prisma.AuditLogCreateInput): Promise<AuditLog> {
    return prisma.auditLog.create({ data });
  }

  private buildWhere(options: FindAuditLogsOptions): Prisma.AuditLogWhereInput {
    const conditions: Prisma.AuditLogWhereInput[] = [];

    if (options.action) {
      conditions.push({ action: options.action });
    }

    if (options.resourceType) {
      conditions.push({ resourceType: options.resourceType });
    }

    if (options.folderId) {
      conditions.push({ folderId: options.folderId });
    }

    if (options.actorId) {
      conditions.push({ actorId: options.actorId });
    }

    if (options.from || options.to) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (options.from) createdAt.gte = options.from;
      if (options.to) createdAt.lte = options.to;
      conditions.push({ createdAt });
    }

    if (options.search) {
      conditions.push({
        OR: [
          { actorUsername: { contains: options.search, mode: 'insensitive' } },
          { action: { contains: options.search, mode: 'insensitive' } },
          { resourceType: { contains: options.search, mode: 'insensitive' } },
          { resourceId: { contains: options.search, mode: 'insensitive' } },
        ],
      });
    }

    if (options.managerScope) {
      const { ownFolderIds, collaboratorIds, managerId } = options.managerScope;
      const orConditions: Prisma.AuditLogWhereInput[] = [
        { actorId: managerId },
      ];

      if (ownFolderIds.length > 0) {
        orConditions.push({ folderId: { in: ownFolderIds } });
      }

      if (collaboratorIds.length > 0) {
        orConditions.push({ actorId: { in: collaboratorIds } });
      }

      conditions.push({ OR: orConditions });
    }

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { AND: conditions };
  }

  async findMany(options: FindAuditLogsOptions): Promise<AuditLog[]> {
    const where = this.buildWhere(options);
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 50;
    const skip = (page - 1) * limit;

    return prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });
  }

  async count(options: FindAuditLogsOptions): Promise<number> {
    const where = this.buildWhere(options);
    return prisma.auditLog.count({ where });
  }
}

export const auditRepository = new AuditRepository();
