import type { FastifySchema } from 'fastify';
import { standardErrorResponses, securityDualAuth } from '../../shared/schemas.js';

export const passValidator = () => () => true;

export const pdfItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    shortCode: { type: 'string', example: 'pdf1234567' },
    originalName: { type: 'string', example: 'manual_operaciones.pdf' },
    sizeBytes: { type: 'integer', example: 1048576 },
    pageCount: { type: 'integer', example: 12 },
    isScanned: { type: 'boolean', example: false },
    metadataCard: { type: ['object', 'null'], additionalProperties: true },
    folderId: { type: ['string', 'null'], format: 'uuid' },
    url: { type: 'string', format: 'uri', example: '/p/pdf1234567' },
    urlWithVersion: { type: 'string', format: 'uri', example: '/p/pdf1234567?v=1740000000000' },
    downloadUrl: { type: 'string', format: 'uri', example: '/p/pdf1234567?download=true' },
    textUrl: { type: 'string', format: 'uri', example: '/p/pdf1234567?format=text' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export const getPdfByShortCodeRouteSchema: FastifySchema = {
  tags: ['Pdfs'],
  summary: 'Visualización inline, descarga directa o lectura de texto de PDF por shortCode',
  description: 'Sin parámetros sirve application/pdf inline. Con ?download=true fuerza descarga attachment. Con ?format=text sirve el artefacto de texto extraído (.text.json.gz) en ~2 ms.',
  params: {
    type: 'object',
    required: ['short_code'],
    properties: { short_code: { type: 'string', minLength: 8, maxLength: 14 } },
  },
  querystring: {
    type: 'object',
    properties: {
      download: { type: 'string', enum: ['true', 'false'] },
      format: { type: 'string', enum: ['text', 'raw'] },
      page: { type: 'integer', minimum: 1 },
      v: { type: 'string' },
    },
  },
  response: {
    404: standardErrorResponses[404],
  },
};

export const listPdfsRouteSchema: FastifySchema = {
  tags: ['Pdfs'],
  summary: 'Lista documentos PDF registrados',
  security: securityDualAuth,
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
      folderId: { type: 'string', format: 'uuid' },
      search: { type: 'string' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        pdfs: { type: 'array', items: pdfItemSchema },
        total: { type: 'integer' },
        page: { type: 'integer' },
        limit: { type: 'integer' },
      },
    },
    401: standardErrorResponses[401],
  },
};

export const uploadPdfRouteSchema: FastifySchema = {
  tags: ['Pdfs'],
  summary: 'Carga multipart de documento PDF (máx. 50MB)',
  description: 'Valida magic bytes %PDF-, analiza contra scripts maliciosos (/JavaScript) y genera el doble artefacto .text.json.gz con Ficha Técnica automática.',
  security: securityDualAuth,
  response: {
    201: { description: 'PDF cargado y procesado exitosamente', ...pdfItemSchema },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    413: standardErrorResponses[413],
    415: standardErrorResponses[415],
  },
};

export const renamePdfRouteSchema: FastifySchema = {
  tags: ['Pdfs'],
  summary: 'Renombra un documento PDF',
  security: securityDualAuth,
  params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
  body: {
    type: 'object',
    required: ['originalName'],
    properties: { originalName: { type: 'string', minLength: 1, maxLength: 255 } },
  },
  response: {
    200: pdfItemSchema,
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};

export const replacePdfRouteSchema: FastifySchema = {
  tags: ['Pdfs'],
  summary: 'Reemplazo en caliente (Hot-Swap) de PDF',
  description: 'Reemplaza el archivo binario y regenera el artefacto .text.json.gz preservando el id, shortCode y URL corta.',
  security: securityDualAuth,
  params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
  response: {
    200: pdfItemSchema,
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
    413: standardErrorResponses[413],
    415: standardErrorResponses[415],
  },
};

export const updatePdfMetadataRouteSchema: FastifySchema = {
  tags: ['Pdfs'],
  summary: 'Actualiza la Ficha Técnica (metadataCard) del PDF',
  security: securityDualAuth,
  params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
  body: {
    type: 'object',
    properties: {
      title: { type: 'string', maxLength: 200 },
      description: { type: 'string', maxLength: 2000 },
      tags: { type: 'array', items: { type: 'string' } },
      keywords: { type: 'array', items: { type: 'string' } },
      summary: { type: 'string', maxLength: 3000 },
    },
  },
  response: {
    200: pdfItemSchema,
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};

export const deletePdfRouteSchema: FastifySchema = {
  tags: ['Pdfs'],
  summary: 'Elimina un documento PDF y destruye sus archivos en disco',
  security: securityDualAuth,
  params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
  response: {
    200: {
      type: 'object',
      properties: {
        deleted: { type: 'boolean', example: true },
        id: { type: 'string', format: 'uuid' },
      },
    },
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};

export const movePdfRouteSchema: FastifySchema = {
  tags: ['Pdfs'],
  summary: 'Mueve un PDF a otra carpeta de tipo PDF',
  security: securityDualAuth,
  params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
  body: {
    type: 'object',
    required: ['folderId'],
    properties: { folderId: { type: 'string', format: 'uuid' } },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        shortCode: { type: 'string' },
        folderId: { type: 'string', format: 'uuid' },
        originalName: { type: 'string' },
        pageCount: { type: 'integer' },
        sizeBytes: { type: 'integer' },
      },
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};

