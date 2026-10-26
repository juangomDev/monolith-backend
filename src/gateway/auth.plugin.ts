import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { hashApiKey } from './auth.js';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import { AppError } from '../shared/errors.js';

const authPluginCallback: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', async (request: FastifyRequest) => {
    const authHeader = request.headers['x-api-key'] as string | undefined;

    if (!authHeader) {
      throw new AppError(401, 'Cabecera X-API-Key requerida', 'UNAUTHORIZED');
    }

    const keyHash = hashApiKey(authHeader, env.API_KEY_PEPPER);
    const client = await prisma.apiClient.findUnique({
      where: { keyHash },
    });

    if (!client || !client.isActive) {
      throw new AppError(401, 'API Key inválida o inactiva', 'UNAUTHORIZED');
    }

    (request as FastifyRequest & { apiClient: typeof client }).apiClient = client;
  });
};

export const authPlugin = fp(authPluginCallback, {
  name: 'auth-plugin',
});
