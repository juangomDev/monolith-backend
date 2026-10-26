import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import fs from 'node:fs/promises';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (_request, reply) => {
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
  });
};
