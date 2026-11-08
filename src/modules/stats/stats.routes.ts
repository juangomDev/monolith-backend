import type { FastifyPluginAsync } from 'fastify';
import { statsService } from './stats.service.js';
import { authenticateUserOrApiKey } from '../../gateway/auth.js';
import { passValidator, getStorageStatsRouteSchema } from './stats.schemas.js';
import { Role } from '@prisma/client';

export const statsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/v1/stats/storage',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: getStorageStatsRouteSchema,
    },
    async (request, reply) => {
      const requester = request.user
        ? { id: request.user.id, role: request.user.role }
        : {
            id: request.apiClient?.id ?? '00000000-0000-0000-0000-000000000000',
            role: Role.ADMIN,
          };

      const result = await statsService.getStorageStats(requester);
      return reply.send(result);
    }
  );
};

