import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { auditService } from './audit.service.js';
import { authenticateUserOrApiKey } from '../../gateway/auth.js';
import { passValidator, listAuditLogsRouteSchema, exportAuditLogsRouteSchema } from './audit.schemas.js';
import { Role } from '@prisma/client';

function extractRequester(request: FastifyRequest) {
  return request.user
    ? { id: request.user.id, role: request.user.role }
    : {
        id: request.apiClient?.id ?? '00000000-0000-0000-0000-000000000000',
        role: Role.ADMIN,
      };
}

function parseFilterQuery(query: any) {
  return {
    action: query.action ? String(query.action) : undefined,
    resourceType: query.resourceType ? String(query.resourceType) : undefined,
    folderId: query.folderId ? String(query.folderId) : undefined,
    actorId: query.actorId ? String(query.actorId) : undefined,
    from: query.from ? String(query.from) : undefined,
    to: query.to ? String(query.to) : undefined,
    search: query.search ? String(query.search).trim() : undefined,
  };
}

export const auditRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/v1/audit-logs',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: listAuditLogsRouteSchema,
    },
    async (request, reply) => {
      const requester = extractRequester(request);
      const query = (request.query as any) || {};
      const page = query.page !== undefined ? parseInt(String(query.page), 10) : undefined;
      const limit = query.limit !== undefined ? parseInt(String(query.limit), 10) : undefined;

      const result = await auditService.listLogs(requester, {
        page,
        limit,
        ...parseFilterQuery(query),
      });

      return reply.send(result);
    }
  );

  fastify.get(
    '/api/v1/audit-logs/export',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: exportAuditLogsRouteSchema,
    },
    async (request, reply) => {
      const requester = extractRequester(request);
      const query = (request.query as any) || {};
      const format = query.format === 'xlsx' ? 'xlsx' : 'csv';

      const { buffer, contentType, filename } = await auditService.exportLogs(
        requester,
        parseFilterQuery(query),
        format
      );

      reply.header('Content-Type', contentType);
      reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      return reply.send(buffer);
    }
  );
};
