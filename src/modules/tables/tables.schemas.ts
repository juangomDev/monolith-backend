import type { FastifyRequest, FastifySchema } from 'fastify';
import { Role } from '@prisma/client';
import {
  standardErrorResponses,
  securityDualAuth,
} from '../../shared/schemas.js';

export const passValidator = () => () => true;

export const tableItemSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string', format: 'uuid' },
    shortCode: { type: 'string', example: 'tab1234567' },
    tableName: { type: 'string', example: 'ventas_2026.csv' },
    rowCount: { type: 'integer', example: 1500 },
    columns: {
      type: 'array',
      items: { type: 'string' },
      example: ['id', 'producto', 'precio', 'fecha'],
    },
    columnsSchema: {
      type: 'array',
      items: { type: 'string' },
    },
    sizeBytes: { type: 'integer', example: 51200 },
    folderId: { type: 'string', format: 'uuid', nullable: true },
    url: { type: 'string', format: 'uri', example: 'http://localhost:3000/t/tab1234567' },
    urlWithVersion: { type: 'string', format: 'uri', example: 'http://localhost:3000/t/tab1234567?v=1740000000000' },
    downloadUrl: { type: 'string', format: 'uri', example: 'http://localhost:3000/t/tab1234567?download=true' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'shortCode', 'tableName', 'rowCount', 'sizeBytes'],
};

export const getTableByShortCodeRouteSchema: FastifySchema = {
  tags: ['Tables'],
  summary: 'Consulta JSON paginada o descarga de dataset por shortCode',
  description:
    'Si incluye query param ?download=true, descarga directamente el archivo original (.csv o .xlsx). Si incluye ?raw=true o se solicita con Accept-Encoding: gzip sin paginar, entrega el stream precalculado ultra-rápido (2 ms). De lo contrario, entrega los datos en formato JSON paginado con esquema de columnas y metadatos.',
  params: {
    type: 'object',
    required: ['short_code'],
    properties: {
      short_code: {
        type: 'string',
        minLength: 8,
        maxLength: 14,
        example: 'tab1234567',
        description: 'Código Base58 opaco de 10 caracteres',
      },
    },
  },
  querystring: {
    type: 'object',
    properties: {
      download: { type: 'string', enum: ['true', 'false'], description: 'Descargar archivo original' },
      raw: { type: 'string', enum: ['true', 'false'], description: 'Servir artefacto precalculado gzip directo' },
      page: { type: 'integer', default: 1, description: 'Número de página a consultar' },
      limit: { type: 'integer', default: 100, maximum: 500, description: 'Registros por página (máx 500)' },
    },
  },
  response: {
    200: {
      description: 'Datos paginados o stream de descarga de dataset',
      type: 'object',
      additionalProperties: true,
      properties: {
        id: { type: 'string' },
        shortCode: { type: 'string' },
        tableName: { type: 'string' },
        columns: { type: 'array', items: { type: 'string' } },
        headers: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
        merges: { type: 'array', items: { type: 'string' } },
        cellStyles: { type: 'object', additionalProperties: true },
        data: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
        meta: {
          type: 'object',
          additionalProperties: true,
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
            hasNext: { type: 'boolean' },
          },
        },
      },
    },
    404: standardErrorResponses[404],
  },
};

export const listTablesRouteSchema: FastifySchema = {
  tags: ['Tables'],
  summary: 'Listar datasets tabulares registrados',
  description: 'Retorna el listado de tablas con paginación SQL respetando las reglas de privacidad de las carpetas contenedoras.',
  security: securityDualAuth,
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', default: 1, description: 'Página solicitada' },
      limit: { type: 'integer', default: 50, maximum: 100, description: 'Cantidad de registros por página' },
      folderId: { type: 'string', format: 'uuid', description: 'Filtrar por carpeta contenedora' },
    },
  },
  response: {
    200: {
      description: 'Listado de tablas obtenido exitosamente',
      type: 'object',
      additionalProperties: true,
      properties: {
        tables: {
          type: 'array',
          items: tableItemSchema,
        },
        total: { type: 'integer', example: 1 },
        page: { type: 'integer', example: 1 },
        limit: { type: 'integer', example: 50 },
        totalPages: { type: 'integer', example: 1 },
        meta: {
          type: 'object',
          additionalProperties: true,
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
            hasNext: { type: 'boolean' },
          },
        },
      },
      required: ['tables', 'total'],
    },
    401: standardErrorResponses[401],
  },
};

export const uploadTableRouteSchema: FastifySchema = {
  tags: ['Tables'],
  summary: 'Subir y procesar dataset tabular (CSV o Excel)',
  description:
    'Ingesta multipart/form-data de archivos CSV o XLSX. Inspecciona cabeceras para deducir columnas y total de filas. Se asigna a General si no se provee folderId.',
  security: securityDualAuth,
  consumes: ['multipart/form-data'],
  response: {
    201: {
      description: 'Dataset subido y procesado exitosamente',
      type: 'object',
      additionalProperties: true,
      properties: {
        id: { type: 'string', format: 'uuid' },
        shortCode: { type: 'string', example: 'tab1234567' },
        url: { type: 'string', format: 'uri' },
        tableName: { type: 'string', example: 'datos.csv' },
        rowCount: { type: 'integer', example: 100 },
        columns: { type: 'array', items: { type: 'string' } },
        sizeBytes: { type: 'integer' },
        folderId: { type: 'string', format: 'uuid', nullable: true },
      },
      required: ['id', 'shortCode', 'url', 'tableName', 'rowCount', 'sizeBytes'],
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    413: standardErrorResponses[413],
    415: standardErrorResponses[415],
  },
};

export const deleteTableRouteSchema: FastifySchema = {
  tags: ['Tables'],
  summary: 'Eliminar dataset física y lógicamente',
  description: 'Elimina el registro de la tabla en base de datos PostgreSQL y destruye su archivo binario en disco.',
  security: securityDualAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid', description: 'UUID de la tabla a eliminar' },
    },
  },
  response: {
    204: {
      description: 'Dataset eliminado exitosamente (sin contenido)',
      type: 'null',
    },
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};

export function extractRequester(request: FastifyRequest): { id: string; role: Role } {
  if (request.user) {
    return { id: request.user.id, role: request.user.role };
  }
  return {
    id: request.apiClient?.id ?? '00000000-0000-0000-0000-000000000000',
    role: Role.ADMIN,
  };
}
