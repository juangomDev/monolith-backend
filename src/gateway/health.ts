import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import fs from 'node:fs/promises';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Verificar salud del sistema, base de datos y almacenamiento',
        description:
          'Comprueba la conectividad activa contra PostgreSQL y la capacidad de escritura en el volumen persistente ./storage.',
        response: {
          200: {
            description: 'Servicio en estado óptimo',
            type: 'object',
            properties: {
              status: { type: 'string', example: 'ok' },
              db: { type: 'string', example: 'up' },
              storage: { type: 'string', example: 'writable' },
              timestamp: { type: 'string', format: 'date-time' },
            },
            required: ['status', 'db', 'storage', 'timestamp'],
          },
          503: {
            description: 'Servicio degradado o no disponible',
            type: 'object',
            properties: {
              status: { type: 'string', example: 'degraded' },
              db: { type: 'string', example: 'down' },
              storage: { type: 'string', example: 'unwritable' },
              timestamp: { type: 'string', format: 'date-time' },
            },
            required: ['status', 'db', 'storage', 'timestamp'],
          },
        },
      },
    },
    async (_request, reply) => {
      let dbStatus = 'down';
      let storageStatus = 'unwritable';

      try {
        await prisma.$queryRaw`SELECT 1`;
        dbStatus = 'up';
      } catch {
        dbStatus = 'down';
      }

      try {
        await fs.access(env.STORAGE_DIR, fs.constants.W_OK);
        storageStatus = 'writable';
      } catch {
        storageStatus = 'unwritable';
      }

      const isHealthy = dbStatus === 'up' && storageStatus === 'writable';
      return reply.status(isHealthy ? 200 : 503).send({
        status: isHealthy ? 'ok' : 'degraded',
        db: dbStatus,
        storage: storageStatus,
        timestamp: new Date().toISOString(),
      });
    }
  );
};
