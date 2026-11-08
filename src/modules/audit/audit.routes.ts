import type { FastifyPluginAsync } from 'fastify';
import { auditService } from './audit.service.js';
import { authenticateUserOrApiKey } from '../../gateway/auth.js';
import { passValidator, listAuditLogsRouteSchema } from './audit.schemas.js';
import { Role } from '@prisma/client';

export const auditRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/v1/audit-logs',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: listAuditLogsRouteSchema,
    },
    async (request, reply) => {
      const requester = request.user
        ? { id: request.user.id, role: request.user.role }
        : {
            id: request.apiClient?.id ?? '00000000-0000-0000-0000-000000000000',
            role: Role.ADMIN,
          };

      const query = (request.query as any) || {};
      const page = query.page !== undefined ? parseInt(String(query.page), 10) : undefined;
      const limit = query.limit !== undefined ? parseInt(String(query.limit), 10) : undefined;
      const action = query.action ? String(query.action) : undefined;
      const resourceType = query.resourceType ? String(query.resourceType) : undefined;
      const folderId = query.folderId ? String(query.folderId) : undefined;

      const result = await auditService.listLogs(requester, {
        page,
        limit,
        action,
        resourceType,
        folderId,
      });

      return reply.send(result);
    }
  );
};

