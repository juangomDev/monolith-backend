import type { FastifySchema } from 'fastify';
import { standardErrorResponses, securityDualAuth } from '../../shared/schemas.js';

export const passValidator = () => () => true;

export const getStorageStatsRouteSchema: FastifySchema = {
  tags: ['Stats'],
  summary: 'Monitoreo de cuotas, peso y salud del almacenamiento',
  description: 'Expone estadísticas de imágenes y tablas en PostgreSQL y disco físico. ADMIN ve métricas globales y salud de disco; MANAGER ve sus carpetas.',
  security: securityDualAuth,
  response: {
    200: {
      description: 'Estadísticas de almacenamiento obtenidas exitosamente',
      type: 'object',
      properties: {
        isAdmin: { type: 'boolean' },
        database: {
          type: 'object',
          properties: {
            images: {
              type: 'object',
              properties: {
                count: { type: 'integer' },
                sizeBytes: { type: 'integer' },
              },
            },
            tables: {
              type: 'object',
              properties: {
                count: { type: 'integer' },
                sizeBytes: { type: 'integer' },
              },
            },
            totalCount: { type: 'integer' },
            totalSizeBytes: { type: 'integer' },
          },
        },
        disk: {
          type: 'object',
          nullable: true,
          properties: {
            imagesBytes: { type: 'integer' },
            imagesFilesCount: { type: 'integer' },
            tablesBytes: { type: 'integer' },
            tablesFilesCount: { type: 'integer' },
            totalBytes: { type: 'integer' },
            totalFilesCount: { type: 'integer' },
          },
        },
        topFolders: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              type: { type: 'string' },
              totalBytes: { type: 'integer' },
              itemsCount: { type: 'integer' },
            },
          },
        },
        warning: { type: 'boolean' },
        warningMessage: { type: 'string', nullable: true },
      },
      required: ['isAdmin', 'database', 'topFolders', 'warning'],
    },
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
  },
};

