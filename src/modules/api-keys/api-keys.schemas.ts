import type { FastifySchema } from 'fastify';
import { standardErrorResponses, securityDualAuth } from '../../shared/schemas.js';

export const passValidator = () => () => true;

export const apiKeyItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'Integración Webhook' },
    description: { type: 'string', nullable: true },
    keyPrefix: { type: 'string', example: 'mk_live_abc12345' },
    rateLimit: { type: 'integer', example: 100 },
    isActive: { type: 'boolean', example: true },
    lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'name', 'keyPrefix', 'rateLimit', 'isActive', 'createdAt'],
};

export const createApiKeyRouteSchema: FastifySchema = {
  tags: ['ApiKeys'],
  summary: 'Crear una nueva API Key (Exclusivo ADMIN)',
  description: 'Genera una llave criptográfica con prefijo mk_live_. Retorna el secreto en texto plano por única vez.',
  security: securityDualAuth,
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100, description: 'Nombre identificativo del cliente' },
      description: { type: 'string', maxLength: 255, description: 'Propósito o descripción del cliente' },
      rateLimit: { type: 'integer', minimum: 1, default: 100, description: 'Peticiones permitidas por minuto' },
    },
  },
  response: {
    201: {
      description: 'API Key creada exitosamente con su secreto en texto plano',
      type: 'object',
      properties: {
        ...apiKeyItemSchema.properties,
        key: { type: 'string', example: 'mk_live_xYz1234567890abcdef...' },
      },
      required: ['id', 'name', 'keyPrefix', 'key', 'rateLimit', 'createdAt'],
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
  },
};

export const listApiKeysRouteSchema: FastifySchema = {
  tags: ['ApiKeys'],
  summary: 'Listar todas las API Keys registradas (Exclusivo ADMIN)',
  description: 'Retorna el catálogo paginado de llaves autorizadas ocultando el secreto criptográfico.',
  security: securityDualAuth,
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1, description: 'Número de página' },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 50, description: 'Registros por página' },
    },
  },
  response: {
    200: {
      description: 'Catálogo de API Keys obtenido exitosamente',
      type: 'object',
      additionalProperties: true,
      properties: {
        keys: { type: 'array', items: apiKeyItemSchema },
        total: { type: 'integer' },
        page: { type: 'integer' },
        limit: { type: 'integer' },
        totalPages: { type: 'integer' },
        meta: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
            hasNext: { type: 'boolean' },
          },
        },
      },
      required: ['keys'],
    },
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
  },
};

export const updateApiKeyRouteSchema: FastifySchema = {
  tags: ['ApiKeys'],
  summary: 'Actualizar configuración o estado de una API Key (Exclusivo ADMIN)',
  description: 'Permite pausar/reactivar (isActive), renombrar o ajustar rateLimit sin revocar la llave criptográfica.',
  security: securityDualAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid', description: 'UUID de la API Key a modificar' },
    },
  },
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      description: { type: 'string', maxLength: 255, nullable: true },
      rateLimit: { type: 'integer', minimum: 1 },
      isActive: { type: 'boolean' },
    },
  },
  response: {
    200: {
      description: 'API Key actualizada exitosamente',
      ...apiKeyItemSchema,
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};

export const revokeApiKeyRouteSchema: FastifySchema = {
  tags: ['ApiKeys'],
  summary: 'Revocar / eliminar una API Key (Exclusivo ADMIN)',
  description: 'Invalida y destruye inmediatamente la API Key especificada.',
  security: securityDualAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid', description: 'UUID de la API Key a revocar' },
    },
  },
  response: {
    200: {
      description: 'API Key revocada exitosamente',
      type: 'object',
      properties: {
        revoked: { type: 'boolean', example: true },
      },
      required: ['revoked'],
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};
