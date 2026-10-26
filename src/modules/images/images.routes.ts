import type { FastifyPluginAsync } from 'fastify';
import { imagesService } from './images.service.js';
import { authenticateApiKey } from '../../gateway/auth.js';
import { AppError } from '../../shared/errors.js';

export const imagesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /i/:short_code (Entrega pública con cache agresiva e inmutable)
  fastify.get('/i/:short_code', async (request, reply) => {
    const { short_code } = request.params as { short_code: string };
    const { record, fileStream } = await imagesService.getImageFileByShortCode(short_code);

    reply.header('Content-Type', record.mimeType);
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.send(fileStream);
  });

  // POST /api/v1/images (Subida protegida con X-API-Key)
  fastify.post('/api/v1/images', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const file = await request.file();
    if (!file) {
      throw new AppError(400, 'Debe adjuntar un archivo de imagen en el campo multipart', 'BAD_REQUEST');
    }

    const result = await imagesService.saveImage(file);
    return reply.status(201).send(result);
  });

  // DELETE /api/v1/images/:id (Eliminación protegida con X-API-Key)
  fastify.delete('/api/v1/images/:id', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await imagesService.deleteImage(id);
    return reply.status(204).send();
  });
};

