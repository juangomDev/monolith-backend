import type { FastifySchema } from 'fastify';
import { standardErrorResponses, securityDualAuth } from '../../shared/schemas.js';
import { tableItemSchema } from './tables.schemas.js';

export const renameTableRouteSchema: FastifySchema = {
  tags: ['Tables'],
  summary: 'Renombrar dataset tabular',
  description: 'Permite modificar tableName sin alterar el almacenamiento físico ni cambiar el shortCode.',
  security: securityDualAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid', description: 'UUID de la tabla a renombrar' },
    },
  },
  body: {
    type: 'object',
    required: ['tableName'],
    properties: {
      tableName: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
        description: 'Nuevo nombre para el archivo de tabla',
      },
    },
  },
  response: {
    200: {
      description: 'Tabla renombrada exitosamente',
      type: 'object',
      additionalProperties: true,
      properties: tableItemSchema.properties,
      required: ['id', 'shortCode', 'tableName', 'rowCount', 'sizeBytes'],
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};

export const replaceTableRouteSchema: FastifySchema = {
  tags: ['Tables'],
  summary: 'Reemplazar en caliente dataset tabular (Hot-Swap)',
  description:
    'Sustituye físicamente el archivo .csv o .xlsx conservando intactos su id, shortCode, folderId y URL pública (/t/:short_code). Regenera el artefacto .data.json.gz y actualiza metadataCard e invalida la caché del Chat.',
  security: securityDualAuth,
  consumes: ['multipart/form-data'],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid', description: 'UUID de la tabla a reemplazar' },
    },
  },
  response: {
    200: {
      description: 'Archivo de tabla reemplazado exitosamente en caliente',
      type: 'object',
      additionalProperties: true,
      properties: tableItemSchema.properties,
      required: ['id', 'shortCode', 'tableName', 'rowCount', 'sizeBytes'],
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
    413: standardErrorResponses[413],
    415: standardErrorResponses[415],
  },
};

