import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { imagesRoutes } from '../modules/images/images.routes.js';
import { tablesRoutes } from '../modules/tables/tables.routes.js';
import { usersRoutes } from '../modules/users/users.routes.js';
import { foldersRoutes } from '../modules/folders/folders.routes.js';
import { foldersSharesRoutes } from '../modules/folders/folders.shares.routes.js';
import { chatRoutes } from '../modules/chat/chat.routes.js';
import { auditRoutes } from '../modules/audit/audit.routes.js';
import { apiKeysRoutes } from '../modules/api-keys/api-keys.routes.js';
import { statsRoutes } from '../modules/stats/stats.routes.js';
import { formsRoutes } from '../modules/forms/forms.routes.js';

export async function registerGatewayRoutes(fastify: FastifyInstance): Promise<void> {
  // Verificación de estado del contenedor en Dokploy
  await fastify.register(healthRoutes);

  // Módulos funcionales
  await fastify.register(imagesRoutes);
  await fastify.register(tablesRoutes);
  await fastify.register(usersRoutes);
  await fastify.register(foldersRoutes);
  await fastify.register(foldersSharesRoutes);
  await fastify.register(chatRoutes);
  await fastify.register(auditRoutes);
  await fastify.register(apiKeysRoutes);
  await fastify.register(statsRoutes);
  await fastify.register(formsRoutes);
}
