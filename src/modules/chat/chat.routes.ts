import type { FastifyPluginAsync } from 'fastify';
import { Role } from '@prisma/client';
import { chatService, type ChatAskInput } from './chat.service.js';
import { authenticateUserOrApiKey } from '../../gateway/auth.js';
import {
  passValidator,
  askChatInternalRouteSchema,
  askChatPublicRouteSchema,
  getPublicSuggestionsRouteSchema,
} from './chat.schemas.js';

export const chatRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. POST /api/v1/chat/ask (Consulta interna privada con RBAC)
  fastify.post(
    '/api/v1/chat/ask',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: askChatInternalRouteSchema,
    },
    async (request, reply) => {
      const requester = request.user
        ? { id: request.user.id, role: request.user.role }
        : { id: request.apiClient?.id ?? '00000000-0000-0000-0000-000000000000', role: Role.ADMIN };

      const result = await chatService.askInternal(request.body as ChatAskInput, requester);
      return reply.send(result);
    }
  );

  // 2. POST /api/v1/public/chat/ask (Widget público con Rate Limiting estricto)
  fastify.post(
    '/api/v1/public/chat/ask',
    {
      validatorCompiler: passValidator,
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
      schema: askChatPublicRouteSchema,
    },
    async (request, reply) => {
      const result = await chatService.askPublic(request.body as ChatAskInput);
      return reply.send(result);
    }
  );

  // 3. GET /api/v1/public/chat/suggestions (Sugerencias dinámicas de preguntas públicas)
  fastify.get(
    '/api/v1/public/chat/suggestions',
    {
      validatorCompiler: passValidator,
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
      schema: getPublicSuggestionsRouteSchema,
    },
    async (request, reply) => {
      const { folderId } = request.query as { folderId?: string };
      const result = await chatService.getPublicSuggestions(folderId);
      return reply.send(result);
    }
  );
};
