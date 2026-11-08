import type { FastifyPluginAsync } from 'fastify';
import { apiKeysService } from './api-keys.service.js';
import { authenticateUserOrApiKey } from '../../gateway/auth.js';
import {
  passValidator,
  createApiKeyRouteSchema,
  listApiKeysRouteSchema,
  revokeApiKeyRouteSchema,
} from './api-keys.schemas.js';
import { Role } from '@prisma/client';

export const apiKeysRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/api/v1/api-keys',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: createApiKeyRouteSchema,
    },
    async (request, reply) => {
      const requester = request.user
        ? { id: request.user.id, role: request.user.role }
        : {
            id: request.apiClient?.id ?? '00000000-0000-0000-0000-000000000000',
            role: Role.ADMIN,
          };

      const result = await apiKeysService.createApiKey(requester, request.body as any);
      return reply.status(201).send(result);
    }
  );

  fastify.get(
    '/api/v1/api-keys',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: listApiKeysRouteSchema,
    },
    async (request, reply) => {
      const requester = request.user
        ? { id: request.user.id, role: request.user.role }
        : {
            id: request.apiClient?.id ?? '00000000-0000-0000-0000-000000000000',
            role: Role.ADMIN,
          };

      const result = await apiKeysService.listApiKeys(requester);
      return reply.send(result);
    }
  );

  fastify.delete(
    '/api/v1/api-keys/:id',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: revokeApiKeyRouteSchema,
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const requester = request.user
        ? { id: request.user.id, role: request.user.role }
        : {
            id: request.apiClient?.id ?? '00000000-0000-0000-0000-000000000000',
            role: Role.ADMIN,
          };

      const result = await apiKeysService.revokeApiKey(requester, id);
      return reply.send(result);
    }
  );
};

