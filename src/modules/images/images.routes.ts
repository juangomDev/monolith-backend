import type { FastifyPluginAsync } from 'fastify';
import { imagesService } from './images.service.js';

export const imagesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /i/:short_code (Entrega pública con cache agresiva)
  fastify.get('/i/:short_code', async (request, reply) => {
    const { short_code } = request.params as { short_code: string };
    const image = await imagesService.getImageByShortCode(short_code);

    reply.header('Content-Type', image.mimeType);
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.send({ id: image.id, shortCode: image.shortCode });
  });

  // POST /api/v1/images (Subida protegida con scope)
  fastify.post('/api/v1/images', async (_request, reply) => {
    // Esqueleto para Fase 2
    return reply.status(501).send({ message: 'Endpoint pendiente de implementación en Fase 2' });
  });

  // DELETE /api/v1/images/:id
  fastify.delete('/api/v1/images/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await imagesService.deleteImage(id);
    return reply.status(204).send();
  });
};
