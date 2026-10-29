import type { FastifyPluginAsync } from 'fastify';
import { imagesService } from './images.service.js';
import { authenticateUserOrApiKey } from '../../gateway/auth.js';
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

  // GET /api/v1/images (Listado protegido con Bearer JWT o X-API-Key)
  fastify.get('/api/v1/images', { preHandler: [authenticateUserOrApiKey] }, async (_request, reply) => {
    const result = await imagesService.listImages();
    return reply.send(result);
  });

  // POST /api/v1/images (Subida protegida con Bearer JWT o X-API-Key)
  fastify.post('/api/v1/images', { preHandler: [authenticateUserOrApiKey] }, async (request, reply) => {
    if (!request.isMultipart()) {
      throw new AppError(400, 'Debe adjuntar un archivo de imagen en el campo multipart', 'BAD_REQUEST');
    }

    const file = await request.file();
    if (!file) {
      throw new AppError(400, 'Debe adjuntar un archivo de imagen en el campo multipart', 'BAD_REQUEST');
    }

    const result = await imagesService.saveImage(file);
    return reply.status(201).send(result);
  });

  // DELETE /api/v1/images/:id (Eliminación protegida con Bearer JWT o X-API-Key)
  fastify.delete('/api/v1/images/:id', { preHandler: [authenticateUserOrApiKey] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await imagesService.deleteImage(id);
    return reply.status(204).send();
  });
};

