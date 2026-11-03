import type { FastifySchema } from 'fastify';
import { standardErrorResponses, securityDualAuth } from '../../shared/schemas.js';

export const passValidator = () => () => true;

export const chatAnswerSchema = {
  type: 'object',
  properties: {
    answer: { type: 'string', description: 'Respuesta analítica fundamentada' },
    foundInSystem: { type: 'boolean', description: 'Indica si los datos existen en el sistema' },
    sources: {
      type: 'array',
      description: 'Tablas utilizadas como fuentes para la respuesta',
      items: {
        type: 'object',
        properties: {
          tableId: { type: 'string', format: 'uuid' },
          tableName: { type: 'string' },
          shortCode: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['tableId', 'tableName', 'shortCode'],
      },
    },
    chartData: {
      type: 'object',
      nullable: true,
      description: 'Datos numéricos procesados listos para graficar',
      properties: {
        labels: { type: 'array', items: { type: 'string' } },
        values: { type: 'array', items: { type: 'number' } },
        percentages: { type: 'array', items: { type: 'number' } },
      },
      required: ['labels', 'values', 'percentages'],
    },
  },
  required: ['answer', 'foundInSystem', 'sources'],
};

export const askChatInternalRouteSchema: FastifySchema = {
  tags: ['Chat'],
  summary: 'Consulta analítica privada sobre tablas con control RBAC',
  description: 'Permite formular preguntas analíticas sobre datasets respetando la jerarquía de roles (ADMIN ve todas, MANAGER ve propias/públicas/compartidas, COLLABORATOR ve compartidas).',
  security: securityDualAuth,
  body: {
    type: 'object',
    required: ['question'],
    properties: {
      question: { type: 'string', minLength: 3, maxLength: 250, description: 'Pregunta sobre los datos' },
      folderId: { type: 'string', format: 'uuid', description: 'Filtrar por carpeta específica' },
      shortCode: { type: 'string', minLength: 8, maxLength: 12, description: 'Filtrar por tabla específica' },
    },
  },
  response: {
    200: {
      description: 'Respuesta analítica generada',
      ...chatAnswerSchema,
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
  },
};

export const askChatPublicRouteSchema: FastifySchema = {
  tags: ['Public Chat'],
  summary: 'Consulta analítica pública para widget web (sin autenticación)',
  description: 'Endpoint con Rate Limiting estricto (30 req/min por IP) para widgets embebidos en sitios web externos. Restringido EXCLUSIVAMENTE a tablas en carpetas públicas.',
  body: {
    type: 'object',
    required: ['question'],
    properties: {
      question: { type: 'string', minLength: 3, maxLength: 250, description: 'Pregunta sobre los datos públicos' },
      folderId: { type: 'string', format: 'uuid', description: 'Filtrar por carpeta pública específica' },
      shortCode: { type: 'string', minLength: 8, maxLength: 12, description: 'Filtrar por tabla pública específica' },
    },
  },
  response: {
    200: {
      description: 'Respuesta analítica para el widget público',
      ...chatAnswerSchema,
    },
    400: standardErrorResponses[400],
    429: standardErrorResponses[429],
  },
};

export const getPublicSuggestionsRouteSchema: FastifySchema = {
  tags: ['Public Chat'],
  summary: 'Sugerencias de preguntas para el widget público',
  description: 'Retorna preguntas recomendadas basadas en las Fichas Técnicas de las tablas públicas disponibles.',
  querystring: {
    type: 'object',
    properties: {
      folderId: { type: 'string', format: 'uuid', description: 'Filtrar sugerencias por carpeta pública' },
    },
  },
  response: {
    200: {
      description: 'Lista de preguntas sugeridas',
      type: 'object',
      properties: {
        suggestions: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['suggestions'],
    },
    429: standardErrorResponses[429],
  },
};
