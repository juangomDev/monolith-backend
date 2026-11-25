import type { FastifySchema } from 'fastify';
import { standardErrorResponses, securityDualAuth } from '../../shared/schemas.js';

const pdfBulkResponseSchema = {
  type: 'object',
  properties: {
    totalRequested: { type: 'integer', example: 3 },
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

export const bulkDeletePdfsRouteSchema: FastifySchema = {
  tags: ['Pdfs'],
  summary: 'Eliminar múltiples documentos PDF en lote',
  description: 'Elimina hasta 50 documentos PDF y sus artefactos (.pdf y .text.json.gz) respetando permisos RBAC e invalidando caché del Chat.',
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
        description: 'Lista de UUIDs de documentos PDF a eliminar (máx. 50)',
      },
    },
  },
  response: {
    200: { description: 'Reporte de eliminación en lote', ...pdfBulkResponseSchema },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
  },
};

export const bulkMovePdfsRouteSchema: FastifySchema = {
  tags: ['Pdfs'],
  summary: 'Mover múltiples documentos PDF a otra carpeta',
  description: 'Mueve hasta 50 documentos PDF hacia una carpeta destino de tipo PDF validando permisos EDIT en origen y destino.',
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
        description: 'Lista de UUIDs de documentos PDF a mover (máx. 50)',
      },
      targetFolderId: {
        type: 'string',
        format: 'uuid',
        description: 'UUID de la carpeta destino (debe ser de tipo PDF)',
      },
    },
  },
  response: {
    200: { description: 'Reporte de movimiento en lote', ...pdfBulkResponseSchema },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};
