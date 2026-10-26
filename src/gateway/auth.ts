import type { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import { AppError } from '../shared/errors.js';

export function hashApiKey(key: string, pepper: string): string {
  return crypto.createHmac('sha256', pepper).update(key).digest('hex');
}

/**
 * Hook preHandler para proteger rutas que requieren API Key
 */
export async function authenticateApiKey(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
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
}
