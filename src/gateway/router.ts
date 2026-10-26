import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { imagesRoutes } from '../modules/images/images.routes.js';
import { tablesRoutes } from '../modules/tables/tables.routes.js';

export async function registerGatewayRoutes(fastify: FastifyInstance): Promise<void> {
  // Verificación de estado del contenedor en Dokploy
  await fastify.register(healthRoutes);

  // Módulos funcionales
  await fastify.register(imagesRoutes);
  await fastify.register(tablesRoutes);
}
