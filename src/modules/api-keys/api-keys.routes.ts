import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { apiKeysService } from './api-keys.service.js';
import { authenticateUserOrApiKey } from '../../gateway/auth.js';
import {
  passValidator,
  createApiKeyRouteSchema,
  listApiKeysRouteSchema,
  updateApiKeyRouteSchema,
  revokeApiKeyRouteSchema,
} from './api-keys.schemas.js';
import { Role } from '@prisma/client';

function extractRequester(request: FastifyRequest) {
  return request.user
    ? { id: request.user.id, role: request.user.role }
    : {
        id: request.apiClient?.id ?? '00000000-0000-0000-0000-000000000000',
        role: Role.ADMIN,
      };
}

export const apiKeysRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/api/v1/api-keys',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: createApiKeyRouteSchema,
    },
    async (request, reply) => {
      const result = await apiKeysService.createApiKey(extractRequester(request), request.body as any);
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
      const query = (request.query as any) || {};
      const page = query.page !== undefined ? parseInt(String(query.page), 10) : undefined;
      const limit = query.limit !== undefined ? parseInt(String(query.limit), 10) : undefined;
      const opts =
        (page !== undefined && !isNaN(page)) || (limit !== undefined && !isNaN(limit))
          ? { page: page !== undefined && !isNaN(page) ? page : undefined, limit: limit !== undefined && !isNaN(limit) ? limit : undefined }
          : undefined;

      const result = await apiKeysService.listApiKeys(extractRequester(request), opts);
      return reply.send(result);
    }
  );

  fastify.patch(
    '/api/v1/api-keys/:id',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: updateApiKeyRouteSchema,
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await apiKeysService.updateApiKey(extractRequester(request), id, request.body as any);
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
      const result = await apiKeysService.revokeApiKey(extractRequester(request), id);
      return reply.send(result);
    }
  );
};
