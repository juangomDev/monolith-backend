import type { FastifySchema } from 'fastify';
import { standardErrorResponses, securityDualAuth } from '../../shared/schemas.js';

export const passValidator = () => () => true;

const securityAuth = securityDualAuth;

export const notificationProperties = {
  id: { type: 'string', format: 'uuid' },
  userId: { type: 'string', format: 'uuid' },
  title: { type: 'string' },
  message: { type: 'string' },
  type: { type: 'string', example: 'FORM_ENTRY_NEW' },
  resourceId: { type: ['string', 'null'] },
  read: { type: 'boolean' },
  createdAt: { type: 'string', format: 'date-time' },
};

export const listNotificationsRouteSchema: FastifySchema = {
  tags: ['Notifications'],
  summary: 'Listar notificaciones del usuario autenticado',
  description: 'Retorna las notificaciones paginadas con soporte para filtro de solo no leídas.',
  security: securityAuth,
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      unreadOnly: { type: 'boolean', default: false },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: notificationProperties,
          },
        },
        meta: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
      },
    },
    ...standardErrorResponses,
  },
};

export const getUnreadCountRouteSchema: FastifySchema = {
  tags: ['Notifications'],
  summary: 'Obtener conteo de notificaciones no leídas',
  description: 'Retorna rápidamente la cantidad de alertas pendientes para mostrar en el badge del frontend.',
  security: securityAuth,
  response: {
    200: {
      type: 'object',
      properties: {
        unreadCount: { type: 'integer', example: 3 },
      },
    },
    ...standardErrorResponses,
  },
};

export const markReadRouteSchema: FastifySchema = {
  tags: ['Notifications'],
  summary: 'Marcar una notificación individual como leída',
  security: securityAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
  response: {
    200: {
      type: 'object',
      properties: notificationProperties,
    },
    ...standardErrorResponses,
  },
};

export const markAllReadRouteSchema: FastifySchema = {
  tags: ['Notifications'],
  summary: 'Marcar todas las notificaciones del usuario como leídas',
  security: securityAuth,
  response: {
    200: {
      type: 'object',
      properties: {
        updatedCount: { type: 'integer', example: 5 },
      },
    },
    ...standardErrorResponses,
  },
};

export const deleteNotificationRouteSchema: FastifySchema = {
  tags: ['Notifications'],
  summary: 'Eliminar una notificación de la bandeja',
  security: securityAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
  response: {
    200: {
      type: 'object',
      properties: { success: { type: 'boolean', example: true } },
    },
    ...standardErrorResponses,
  },
};

export const streamNotificationsRouteSchema: FastifySchema = {
  tags: ['Notifications'],
  summary: 'Conexión Server-Sent Events (SSE) para notificaciones en vivo',
  description: 'Mantiene un stream HTTP persistente (text/event-stream) para emitir eventos de notificación instantáneos.',
  security: securityAuth,
  response: {
    200: {
      type: 'string',
      description: 'Stream persistente de eventos Server-Sent Events (text/event-stream)',
    },
    ...standardErrorResponses,
  },
};

export const subscribeFormRouteSchema: FastifySchema = {
  tags: ['Notifications'],
  summary: 'Suscribirse o actualizar alertas de un formulario / tabla abierta',
  description: 'Permite al usuario recibir alertas cuando lleguen nuevas respuestas o se resuelvan entradas.',
  security: securityAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
  body: {
    type: 'object',
    properties: {
      notifyOnNewEntry: { type: 'boolean', default: true },
      notifyOnResolution: { type: 'boolean', default: false },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        userId: { type: 'string', format: 'uuid' },
        formId: { type: 'string', format: 'uuid' },
        notifyOnNewEntry: { type: 'boolean' },
        notifyOnResolution: { type: 'boolean' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
    ...standardErrorResponses,
  },
};

export const unsubscribeFormRouteSchema: FastifySchema = {
  tags: ['Notifications'],
  summary: 'Cancelar suscripción a un formulario',
  security: securityAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
  response: {
    200: {
      type: 'object',
      properties: { success: { type: 'boolean', example: true } },
    },
    ...standardErrorResponses,
  },
};

export const getFormSubscriptionRouteSchema: FastifySchema = {
  tags: ['Notifications'],
  summary: 'Consultar estado de suscripción del usuario en un formulario',
  security: securityAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        subscribed: { type: 'boolean' },
        subscription: {
          type: ['object', 'null'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            formId: { type: 'string', format: 'uuid' },
            notifyOnNewEntry: { type: 'boolean' },
            notifyOnResolution: { type: 'boolean' },
          },
        },
      },
    },
    ...standardErrorResponses,
  },
};
