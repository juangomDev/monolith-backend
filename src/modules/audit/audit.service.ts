import { Role } from '@prisma/client';
import { auditRepository, type FindAuditLogsOptions } from './audit.repository.js';
import { buildAuditLogsExport } from './audit.export.service.js';
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

export interface ListAuditLogsInput extends Omit<FindAuditLogsOptions, 'managerScope' | 'from' | 'to'> {
  from?: Date | string;
  to?: Date | string;
}

function parseOptionalDate(val: Date | string | undefined, fieldName: string): Date | undefined {
  if (val === undefined || val === '') return undefined;
  const date = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, `Fecha inválida para el filtro '${fieldName}'`, 'INVALID_DATE');
  }
  return date;
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

  private async resolveManagerScope(caller: RequesterContext): Promise<FindAuditLogsOptions['managerScope']> {
    if (caller.role === Role.COLLABORATOR) {
      throw new AppError(403, 'Los colaboradores no tienen permiso para consultar registros de auditoría', 'FORBIDDEN');
    }
    if (caller.role !== Role.MANAGER) return undefined;

    const [ownFolders, collaborators] = await Promise.all([
      prisma.folder.findMany({ where: { userId: caller.id }, select: { id: true } }),
      prisma.user.findMany({ where: { createdById: caller.id }, select: { id: true } }),
    ]);

    return {
      ownFolderIds: ownFolders.map((f) => f.id),
      collaboratorIds: collaborators.map((u) => u.id),
      managerId: caller.id,
    };
  }

  async listLogs(caller: RequesterContext, options: ListAuditLogsInput) {
    const managerScope = await this.resolveManagerScope(caller);

    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 100) : 50;
    const from = parseOptionalDate(options.from, 'from');
    const to = parseOptionalDate(options.to, 'to');

    const queryOptions: FindAuditLogsOptions = {
      ...options,
      from,
      to,
      search: options.search?.trim() || undefined,
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

  async exportLogs(
    caller: RequesterContext,
    options: Omit<ListAuditLogsInput, 'page' | 'limit'>,
    format: 'csv' | 'xlsx' = 'csv'
  ) {
    const managerScope = await this.resolveManagerScope(caller);
    const from = parseOptionalDate(options.from, 'from');
    const to = parseOptionalDate(options.to, 'to');

    const logs = await auditRepository.findMany({
      ...options,
      from,
      to,
      search: options.search?.trim() || undefined,
      page: 1,
      limit: 10000,
      managerScope,
    });

    return buildAuditLogsExport(logs, format === 'xlsx' ? 'xlsx' : 'csv');
  }
}

export const auditService = new AuditService();
