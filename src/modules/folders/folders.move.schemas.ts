import type { FastifySchema } from 'fastify';
import { standardErrorResponses, securityDualAuth } from '../../shared/schemas.js';

export const moveImageToFolderRouteSchema: FastifySchema = {
  tags: ['Folders'],
  summary: 'Mover imagen a otra carpeta',
  description:
    'Reasigna una imagen a una carpeta de tipo IMAGE. Valida compatibilidad de tipo y permisos sobre la carpeta destino.',
  security: securityDualAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid', description: 'UUID de la imagen' },
    },
  },
  body: {
    type: 'object',
    required: ['folderId'],
    properties: {
      folderId: { type: 'string', format: 'uuid', description: 'UUID de la carpeta destino de tipo IMAGE' },
    },
  },
  response: {
    200: {
      description: 'Imagen reasignada exitosamente',
      type: 'object',
      properties: {
        image: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            shortCode: { type: 'string', example: 'abc1234567' },
            folderId: { type: 'string', format: 'uuid' },
            originalName: { type: 'string' },
            mimeType: { type: 'string' },
            sizeBytes: { type: 'integer' },
          },
        },
      },
      required: ['image'],
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};

export const moveTableToFolderRouteSchema: FastifySchema = {
  tags: ['Folders'],
  summary: 'Mover tabla (dataset) a otra carpeta',
  description:
    'Reasigna una tabla a una carpeta de tipo TABLE. Valida compatibilidad de tipo y permisos sobre la carpeta destino.',
  security: securityDualAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid', description: 'UUID de la tabla' },
    },
  },
  body: {
    type: 'object',
    required: ['folderId'],
    properties: {
      folderId: { type: 'string', format: 'uuid', description: 'UUID de la carpeta destino de tipo TABLE' },
    },
  },
  response: {
    200: {
      description: 'Tabla reasignada exitosamente',
      type: 'object',
      properties: {
        table: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            shortCode: { type: 'string', example: 'tab1234567' },
            folderId: { type: 'string', format: 'uuid' },
            tableName: { type: 'string' },
            rowCount: { type: 'integer' },
            sizeBytes: { type: 'integer' },
          },
        },
      },
      required: ['table'],
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};
