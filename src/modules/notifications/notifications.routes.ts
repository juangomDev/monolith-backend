import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { Role } from '@prisma/client';
import { notificationsService } from './notifications.service.js';
import { authenticateUserOrApiKey } from '../../gateway/auth.js';
import {
  passValidator,
  listNotificationsRouteSchema,
  getUnreadCountRouteSchema,
  markReadRouteSchema,
  markAllReadRouteSchema,
  deleteNotificationRouteSchema,
  streamNotificationsRouteSchema,
  subscribeFormRouteSchema,
  unsubscribeFormRouteSchema,
  getFormSubscriptionRouteSchema,
} from './notifications.schemas.js';

function extractRequester(request: FastifyRequest): { id: string; role: Role } {
  if (request.user) {
    return { id: request.user.id, role: request.user.role };
  }
  return {
    id: request.apiClient?.id ?? '00000000-0000-0000-0000-000000000000',
    role: Role.ADMIN,
  };
}

export const notificationsRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Listado paginado de notificaciones del usuario
  fastify.get(
    '/api/v1/notifications',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: listNotificationsRouteSchema,
    },
    async (request, reply) => {
      const caller = extractRequester(request);
      const query = request.query as any;
      const result = await notificationsService.listNotifications(caller.id, {
        page: query.page ? parseInt(query.page, 10) : 1,
        limit: query.limit ? parseInt(query.limit, 10) : 20,
        unreadOnly: query.unreadOnly === true || query.unreadOnly === 'true',
      });
      return reply.send(result);
    }
  );

  // 2. Conteo de no leídas
  fastify.get(
    '/api/v1/notifications/unread-count',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: getUnreadCountRouteSchema,
    },
    async (request, reply) => {
      const caller = extractRequester(request);
      const result = await notificationsService.getUnreadCount(caller.id);
      return reply.send(result);
    }
  );

  // 3. Marcar una notificación individual como leída
  fastify.patch(
    '/api/v1/notifications/:id/read',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: markReadRouteSchema,
    },
    async (request, reply) => {
      const caller = extractRequester(request);
      const { id } = request.params as { id: string };
      const updated = await notificationsService.markAsRead(id, caller.id);
      return reply.send(updated);
    }
  );

  // 4. Marcar todas como leídas
  fastify.patch(
    '/api/v1/notifications/read-all',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: markAllReadRouteSchema,
    },
    async (request, reply) => {
      const caller = extractRequester(request);
      const result = await notificationsService.markAllAsRead(caller.id);
      return reply.send(result);
    }
  );

  // 5. Eliminar una notificación
  fastify.delete(
    '/api/v1/notifications/:id',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: deleteNotificationRouteSchema,
    },
    async (request, reply) => {
      const caller = extractRequester(request);
      const { id } = request.params as { id: string };
      const result = await notificationsService.deleteNotification(id, caller.id);
      return reply.send(result);
    }
  );

  // 6. Conexión Server-Sent Events (SSE) en tiempo real
  fastify.get(
    '/api/v1/notifications/stream',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: streamNotificationsRouteSchema,
    },
    async (request, reply) => {
      const caller = extractRequester(request);
      notificationsService.handleSseConnection(caller.id, request, reply);
    }
  );

  // 7. Suscribirse a un formulario / tabla abierta
  fastify.post(
    '/api/v1/forms/:id/subscribe',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: subscribeFormRouteSchema,
    },
    async (request, reply) => {
      const caller = extractRequester(request);
      const { id } = request.params as { id: string };
      const body = (request.body as any) || {};
      const result = await notificationsService.subscribeToForm(caller.id, id, body, caller);
      return reply.send(result);
    }
  );

  // 8. Cancelar suscripción a un formulario
  fastify.delete(
    '/api/v1/forms/:id/subscribe',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: unsubscribeFormRouteSchema,
    },
    async (request, reply) => {
      const caller = extractRequester(request);
      const { id } = request.params as { id: string };
      const result = await notificationsService.unsubscribeFromForm(caller.id, id, caller);
      return reply.send(result);
    }
  );

  // 9. Consultar estado de suscripción en un formulario
  fastify.get(
    '/api/v1/forms/:id/subscription',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: getFormSubscriptionRouteSchema,
    },
    async (request, reply) => {
      const caller = extractRequester(request);
      const { id } = request.params as { id: string };
      const result = await notificationsService.getSubscription(caller.id, id, caller);
      return reply.send(result);
    }
  );
};

