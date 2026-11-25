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

const commonAuditFilterProperties = {
  action: { type: 'string', description: 'Filtrar por acción específica (ej. USER_CREATE, TABLE_UPLOAD)' },
  resourceType: { type: 'string', description: 'Filtrar por tipo de recurso (USER, FOLDER, IMAGE, TABLE, PDF, FORM, API_KEY)' },
  folderId: { type: 'string', format: 'uuid', description: 'Filtrar por carpeta específica' },
  actorId: { type: 'string', format: 'uuid', description: 'Filtrar por UUID del usuario actor' },
  from: { type: 'string', format: 'date-time', description: 'Fecha/hora inicial ISO 8601 (inclusive)' },
  to: { type: 'string', format: 'date-time', description: 'Fecha/hora final ISO 8601 (inclusive)' },
  search: { type: 'string', description: 'Búsqueda libre en actorUsername, action, resourceType o resourceId' },
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
      ...commonAuditFilterProperties,
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
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
  },
};

export const exportAuditLogsRouteSchema: FastifySchema = {
  tags: ['Audit'],
  summary: 'Exportar historial de auditoría en CSV o Excel (.xlsx)',
  description: 'Descarga los registros de auditoría filtrados con protección anti-inyección de fórmulas. ADMIN exporta todo; MANAGER exporta su alcance.',
  security: securityDualAuth,
  querystring: {
    type: 'object',
    properties: {
      format: { type: 'string', enum: ['csv', 'xlsx'], default: 'csv', description: 'Formato de descarga (csv o xlsx)' },
      ...commonAuditFilterProperties,
    },
  },
  response: {
    200: {
      description: 'Archivo binario CSV o XLSX con eventos de auditoría',
      type: 'string',
      format: 'binary',
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
  },
};
