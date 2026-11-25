import type { FastifySchema } from 'fastify';
import { standardErrorResponses, securityDualAuth } from '../../shared/schemas.js';

export const updateFormRouteSchema: FastifySchema = {
  tags: ['Forms'],
  summary: 'Actualizar configuración de un formulario',
  description: 'Actualiza título, estados permitidos de resolución, bandera IA o URL webhook externa. Requiere permiso EDIT.',
  security: securityDualAuth,
  params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
  body: {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 2, maxLength: 120 },
      allowedResolutionStates: { type: 'array', items: { type: 'string' }, minItems: 1 },
      autoResolveWithAi: { type: 'boolean' },
      externalTargetUrl: { type: ['string', 'null'] },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        slug: { type: 'string' },
        title: { type: 'string' },
        folderId: { type: 'string', format: 'uuid' },
        allowedResolutionStates: { type: 'array', items: { type: 'string' } },
        autoResolveWithAi: { type: 'boolean' },
        externalTargetUrl: { type: ['string', 'null'] },
        linkedTableId: { type: ['string', 'null'], format: 'uuid' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};

export const deleteFormRouteSchema: FastifySchema = {
  tags: ['Forms'],
  summary: 'Eliminar un formulario y su tabla abierta vinculada',
  description: 'Elimina el formulario, sus entradas en cascada y limpia la tabla abierta vinculada junto a su artefacto .data.json.gz.',
  security: securityDualAuth,
  params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
  response: {
    200: {
      type: 'object',
      properties: {
        deleted: { type: 'boolean', example: true },
        id: { type: 'string', format: 'uuid' },
      },
      required: ['deleted', 'id'],
    },
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};
