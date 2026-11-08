import type { FastifySchema } from 'fastify';
import { standardErrorResponses, securityDualAuth } from '../../shared/schemas.js';

export const passValidator = () => () => true;

const fieldDefinitionsSchema = {
  oneOf: [
    {
      type: 'array',
      items: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          required: { type: 'boolean' },
          label: { type: 'string' },
        },
      },
    },
    { type: 'object', additionalProperties: true },
  ],
};

const formResponseProperties = {
  id: { type: 'string', format: 'uuid' },
  slug: { type: 'string' },
  title: { type: 'string' },
  folderId: { type: 'string', format: 'uuid' },
  entryFieldsSchema: { type: ['array', 'object'] },
  resolutionFieldsSchema: { type: ['array', 'object'] },
  allowedResolutionStates: { type: 'array', items: { type: 'string' } },
  autoResolveWithAi: { type: 'boolean' },
  externalTargetUrl: { type: ['string', 'null'] },
  linkedTableId: { type: ['string', 'null'], format: 'uuid' },
  linkedTable: { type: ['object', 'null'], additionalProperties: true },
  createdAt: { type: 'string', format: 'date-time' },
};

export const createFormRouteSchema: FastifySchema = {
  tags: ['Forms'],
  summary: 'Crea un nuevo formulario customizable y genera su tabla viva vinculada',
  description: 'Esquema dual: campos de entrada y campos de respuesta exclusiva. Genera TableRegistry con .data.json.gz sincronizado.',
  security: securityDualAuth,
  body: {
    type: 'object',
    required: ['slug', 'title', 'folderId', 'entryFieldsSchema'],
    properties: {
      slug: { type: 'string', minLength: 2, maxLength: 80, pattern: '^[a-zA-Z0-9_-]+$' },
      title: { type: 'string', minLength: 2, maxLength: 120 },
      folderId: { type: 'string', format: 'uuid' },
      entryFieldsSchema: fieldDefinitionsSchema,
      resolutionFieldsSchema: fieldDefinitionsSchema,
      allowedResolutionStates: { type: 'array', items: { type: 'string' }, default: ['VALID', 'INVALID'] },
      autoResolveWithAi: { type: 'boolean', default: false },
      externalTargetUrl: { type: 'string', format: 'uri' },
    },
  },
  response: {
    201: { description: 'Formulario creado', type: 'object', properties: formResponseProperties },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    409: standardErrorResponses[409],
  },
};

export const listFormsRouteSchema: FastifySchema = {
  tags: ['Forms'],
  summary: 'Lista los formularios accesibles',
  security: securityDualAuth,
  querystring: {
    type: 'object',
    properties: {
      folderId: { type: 'string', format: 'uuid' },
      search: { type: 'string' },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        forms: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              slug: { type: 'string' },
              title: { type: 'string' },
              folderId: { type: 'string', format: 'uuid' },
              linkedTable: { type: ['object', 'null'], additionalProperties: true },
              _count: { type: 'object', properties: { entries: { type: 'integer' } } },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    401: standardErrorResponses[401],
  },
};

export const getFormRouteSchema: FastifySchema = {
  tags: ['Forms'],
  summary: 'Obtiene el detalle de un formulario por ID o slug',
  security: securityDualAuth,
  params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
  response: {
    200: { type: 'object', properties: formResponseProperties },
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};

export const submitEntryRouteSchema: FastifySchema = {
  tags: ['Forms'],
  summary: 'Endpoint 1: Envío público de datos para un formulario',
  description: 'Ruta pública rate-limited. Guarda entryPayload en status NEW y sincroniza la tabla viva en tiempo real.',
  params: { type: 'object', required: ['slug'], properties: { slug: { type: 'string' } } },
  body: { type: 'object', additionalProperties: true },
  response: {
    201: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        status: { type: 'string', example: 'NEW' },
        createdAt: { type: 'string', format: 'date-time' },
      },
      required: ['id', 'status', 'createdAt'],
    },
    400: standardErrorResponses[400],
    404: standardErrorResponses[404],
    429: standardErrorResponses[429],
  },
};

export const resolveEntryRouteSchema: FastifySchema = {
  tags: ['Forms'],
  summary: 'Endpoint 2: Completar respuesta única inmutable (Write-Once)',
  description: 'Completa la respuesta y sella status a VALID/INVALID una sola vez. Reintentos retornan 409 CONFLICT.',
  security: securityDualAuth,
  params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
  body: {
    type: 'object',
    required: ['status', 'resolutionPayload'],
    properties: {
      status: { type: 'string', example: 'VALID' },
      resolutionPayload: { type: 'object', additionalProperties: true },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        status: { type: 'string' },
        entryPayload: { type: 'object' },
        resolutionPayload: { type: 'object' },
        resolvedById: { type: ['string', 'null'], format: 'uuid' },
        resolvedAt: { type: ['string', 'null'], format: 'date-time' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
    409: standardErrorResponses[409],
  },
};

export const dispatchEntryRouteSchema: FastifySchema = {
  tags: ['Forms'],
  summary: 'Reenvío bajo demanda hacia el sistema externo de PDFs',
  description: 'Reenvía el JSON sellado a externalTargetUrl tantas veces como se requiera sin crear PDFs en disco.',
  security: securityDualAuth,
  params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
  response: {
    200: {
      type: 'object',
      properties: {
        dispatched: { type: 'boolean' },
        targetUrl: { type: 'string' },
        entryId: { type: 'string', format: 'uuid' },
        dispatchedAt: { type: 'string', format: 'date-time' },
      },
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};

export const listEntriesRouteSchema: FastifySchema = {
  tags: ['Forms'],
  summary: 'Lista las entradas de un formulario',
  security: securityDualAuth,
  params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
  querystring: {
    type: 'object',
    properties: {
      month: { type: 'string', pattern: '^\\d{4}-\\d{2}$', description: 'Filtro por mes YYYY-MM' },
      status: { type: 'string' },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        total: { type: 'integer' },
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              status: { type: 'string' },
              entryPayload: { type: 'object' },
              resolutionPayload: { type: ['object', 'null'] },
              resolvedAt: { type: ['string', 'null'], format: 'date-time' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};

export const exportEntriesRouteSchema: FastifySchema = {
  tags: ['Forms'],
  summary: 'Exporta las entradas a Excel (.xlsx) o CSV (.csv)',
  security: securityDualAuth,
  params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
  querystring: {
    type: 'object',
    properties: {
      month: { type: 'string', pattern: '^\\d{4}-\\d{2}$', description: 'Filtro por mes YYYY-MM' },
      status: { type: 'string' },
      format: { type: 'string', enum: ['xlsx', 'csv'], default: 'xlsx' },
    },
  },
  response: {
    200: { description: 'Archivo binario exportado (.xlsx o .csv)' },
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};
