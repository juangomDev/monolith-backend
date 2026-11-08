import type { FastifySchema } from 'fastify';
import { standardErrorResponses, securityDualAuth } from '../../shared/schemas.js';

export const bulkOperationResponseSchema = {
  type: 'object',
  properties: {
    totalRequested: { type: 'integer', example: 5 },
    successful: { type: 'array', items: { type: 'string', format: 'uuid' } },
    failed: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['id', 'reason'],
      },
    },
  },
  required: ['totalRequested', 'successful', 'failed'],
};

export const bulkDeleteTablesRouteSchema: FastifySchema = {
  tags: ['Tables'],
  summary: 'Eliminar múltiples datasets tabulares en lote',
  description: 'Elimina en lote hasta 50 tablas física y lógicamente respetando permisos RBAC de cada recurso.',
  security: securityDualAuth,
  body: {
    type: 'object',
    required: ['ids'],
    properties: {
      ids: {
        type: 'array',
        items: { type: 'string', format: 'uuid' },
        minItems: 1,
        maxItems: 50,
        description: 'Lista de UUIDs de tablas a eliminar (máx. 50)',
      },
    },
  },
  response: {
    200: {
      description: 'Reporte de ejecución de eliminación en lote',
      ...bulkOperationResponseSchema,
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
  },
};

export const bulkMoveTablesRouteSchema: FastifySchema = {
  tags: ['Tables'],
  summary: 'Mover múltiples datasets tabulares a otra carpeta',
  description: 'Mueve en lote hasta 50 tablas hacia una carpeta de tipo TABLE validando permisos de edición en origen y destino.',
  security: securityDualAuth,
  body: {
    type: 'object',
    required: ['ids', 'targetFolderId'],
    properties: {
      ids: {
        type: 'array',
        items: { type: 'string', format: 'uuid' },
        minItems: 1,
        maxItems: 50,
        description: 'Lista de UUIDs de tablas a mover (máx. 50)',
      },
      targetFolderId: {
        type: 'string',
        format: 'uuid',
        description: 'UUID de la carpeta destino (debe ser de tipo TABLE)',
      },
    },
  },
  response: {
    200: {
      description: 'Reporte de ejecución de movimiento en lote',
      ...bulkOperationResponseSchema,
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};

