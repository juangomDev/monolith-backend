import { Role } from '@prisma/client';
import { auditRepository, type FindAuditLogsOptions } from './audit.repository.js';
import { prisma } from '../../config/db.js';
import { AppError } from '../../shared/errors.js';
import type { RequesterContext } from '../folders/folders.service.js';

export interface RecordLogInput {
  actorId?: string | null;
  actorUsername: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  folderId?: string | null;
  metadata?: Record<string, any> | null;
  ipAddress?: string | null;
}

export class AuditService {
  recordLog(input: RecordLogInput): void {
    Promise.resolve().then(async () => {
      try {
        await auditRepository.create({
          actorId: input.actorId ?? null,
          actorUsername: input.actorUsername || 'anonymous',
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId ? String(input.resourceId) : null,
          folderId: input.folderId ?? null,
          metadata: input.metadata ?? undefined,
          ipAddress: input.ipAddress ?? null,
        });
      } catch {
        // Fire-and-forget: nunca interrumpir la ejecución principal
      }
    });
  }

  async listLogs(
    caller: RequesterContext,
    options: Omit<FindAuditLogsOptions, 'managerScope'>
  ) {
    if (caller.role === Role.COLLABORATOR) {
      throw new AppError(403, 'Los colaboradores no tienen permiso para consultar registros de auditoría', 'FORBIDDEN');
    }

    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 100) : 50;

    let managerScope: FindAuditLogsOptions['managerScope'] = undefined;

    if (caller.role === Role.MANAGER) {
      const ownFolders = await prisma.folder.findMany({
        where: { userId: caller.id },
        select: { id: true },
      });
      const collaborators = await prisma.user.findMany({
        where: { createdById: caller.id },
        select: { id: true },
      });

      managerScope = {
        ownFolderIds: ownFolders.map((f) => f.id),
        collaboratorIds: collaborators.map((u) => u.id),
        managerId: caller.id,
      };
    }

    const queryOptions: FindAuditLogsOptions = {
      ...options,
      page,
      limit,
      managerScope,
    };

    const logs = await auditRepository.findMany(queryOptions);
    const total = await auditRepository.count(queryOptions);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      logs,
      total,
      page,
      limit,
      totalPages,
      meta: { page, limit, total, totalPages, hasNext: page < totalPages },
    };
  }
}

export const auditService = new AuditService();

