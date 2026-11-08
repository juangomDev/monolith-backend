import type { FastifySchema } from 'fastify';
import { standardErrorResponses, securityDualAuth } from '../../shared/schemas.js';

export const passValidator = () => () => true;

export const auditLogItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    actorId: { type: 'string', format: 'uuid', nullable: true },
    actorUsername: { type: 'string' },
    action: { type: 'string' },
    resourceType: { type: 'string' },
    resourceId: { type: 'string', nullable: true },
    folderId: { type: 'string', format: 'uuid', nullable: true },
    metadata: { type: 'object', additionalProperties: true, nullable: true },
    ipAddress: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'actorUsername', 'action', 'resourceType', 'createdAt'],
};

export const listAuditLogsRouteSchema: FastifySchema = {
  tags: ['Audit'],
  summary: 'Consultar historial y trazabilidad de auditoría',
  description: 'Retorna registros de auditoría filtrados y paginados. ADMIN ve todo; MANAGER ve eventos sobre sus carpetas o colaboradores.',
  security: securityDualAuth,
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', default: 1, description: 'Número de página' },
      limit: { type: 'integer', default: 50, maximum: 100, description: 'Registros por página (máx. 100)' },
      action: { type: 'string', description: 'Filtrar por acción específica (ej. USER_CREATE, TABLE_UPLOAD)' },
      resourceType: { type: 'string', description: 'Filtrar por tipo de recurso (USER, FOLDER, IMAGE, TABLE)' },
      folderId: { type: 'string', format: 'uuid', description: 'Filtrar por carpeta específica' },
    },
  },
  response: {
    200: {
      description: 'Listado de eventos de auditoría obtenido exitosamente',
      type: 'object',
      properties: {
        logs: { type: 'array', items: auditLogItemSchema },
        total: { type: 'integer', example: 10 },
        page: { type: 'integer', example: 1 },
        limit: { type: 'integer', example: 50 },
        totalPages: { type: 'integer', example: 1 },
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
      required: ['logs', 'total', 'page', 'limit', 'totalPages'],
    },
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
  },
};

