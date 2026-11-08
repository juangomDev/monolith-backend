import type { FastifyPluginAsync } from 'fastify';
import { imagesService } from './images.service.js';
import { imagesBulkService } from './images.bulk.service.js';
import { authenticateUserOrApiKey } from '../../gateway/auth.js';
import { AppError } from '../../shared/errors.js';
import {
  passValidator,
  getPublicImageSchema,
  listImagesRouteSchema,
  uploadImageRouteSchema,
  renameImageRouteSchema,
  replaceImageRouteSchema,
  deleteImageRouteSchema,
  renameImageBodySchema,
  extractRequester,
} from './images.schemas.js';
import { bulkDeleteImagesRouteSchema, bulkMoveImagesRouteSchema } from './images.bulk.schemas.js';

export const imagesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /i/:short_code (Entrega pública con capability URL y soporte de miniaturas)
  fastify.get(
    '/i/:short_code',
    {
      validatorCompiler: passValidator,
      schema: getPublicImageSchema,
    },
    async (request, reply) => {
      const { short_code } = request.params as { short_code: string };
      const { variant } = (request.query as { variant?: 'thumb' | 'original' }) || {};
      const result = (await imagesService.getImageFileByShortCode(short_code, variant)) as any;
      const mimeType = result.mimeType || result.record?.mimeType || 'application/octet-stream';

      reply.header('Content-Type', mimeType);
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      if (mimeType === 'image/svg+xml') {
        reply.header('Content-Security-Policy', "default-src 'none'");
      }
      return reply.send(result.fileStream);
    }
  );

  // GET /api/v1/images (Listado protegido con Bearer JWT o X-API-Key y paginación)
  fastify.get(
    '/api/v1/images',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: listImagesRouteSchema,
    },
    async (request, reply) => {
      const requester = request.user ? { id: request.user.id, role: request.user.role } : undefined;
      const query = (request.query as any) || {};
      const page = query.page !== undefined ? parseInt(String(query.page), 10) : undefined;
      const limit = query.limit !== undefined ? parseInt(String(query.limit), 10) : undefined;
      const folderId = query.folderId ? String(query.folderId) : undefined;
      const search = query.search ? String(query.search).trim() : undefined;

      const result = await imagesService.listImages(
        {
          page: page !== undefined && !isNaN(page) ? page : undefined,
          limit: limit !== undefined && !isNaN(limit) ? limit : undefined,
          folderId,
          search,
        },
        requester
      );
      return reply.send(result);
    }
  );

  // POST /api/v1/images (Subida protegida con Bearer JWT o X-API-Key)
  fastify.post(
    '/api/v1/images',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: uploadImageRouteSchema,
    },
    async (request, reply) => {
      if (!request.isMultipart()) {
        throw new AppError(400, 'Debe adjuntar un archivo de imagen en el campo multipart', 'BAD_REQUEST');
      }

      const file = await request.file();
      if (!file) {
        throw new AppError(400, 'Debe adjuntar un archivo de imagen en el campo multipart', 'BAD_REQUEST');
      }

      const requester = extractRequester(request);
      const folderIdField = file.fields?.folderId as { value?: string } | undefined;
      const folderId = folderIdField?.value || (request.query as { folderId?: string })?.folderId;

      const result = await imagesService.saveImage(file, folderId, requester);
      return reply.status(201).send(result);
    }
  );

  // PATCH /api/v1/images/:id (Renombrar originalName)
  fastify.patch(
    '/api/v1/images/:id',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: renameImageRouteSchema,
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = renameImageBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new AppError(
          400,
          parseResult.error.issues[0]?.message || 'Nombre original inválido',
          'BAD_REQUEST'
        );
      }

      const requester = await extractRequester(request);
      const result = await imagesService.renameImage(id, parseResult.data.originalName, requester);
      return reply.status(200).send(result);
    }
  );

  // PUT /api/v1/images/:id (Reemplazo de binario en caliente preservando shortCode)
  fastify.put(
    '/api/v1/images/:id',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: replaceImageRouteSchema,
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!request.isMultipart()) {
        throw new AppError(400, 'Debe adjuntar un archivo de imagen en el campo multipart', 'BAD_REQUEST');
      }

      const file = await request.file();
      if (!file) {
        throw new AppError(400, 'Debe adjuntar un archivo de imagen en el campo multipart', 'BAD_REQUEST');
      }

      const requester = await extractRequester(request);
      const result = await imagesService.replaceImageFile(id, file, requester);
      return reply.status(200).send(result);
    }
  );

  // DELETE /api/v1/images/:id (Eliminación protegida con Bearer JWT o X-API-Key)
  fastify.delete(
    '/api/v1/images/:id',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: deleteImageRouteSchema,
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const requester = await extractRequester(request);
      await imagesService.deleteImage(id, requester);
      return reply.status(204).send();
    }
  );

  // POST /api/v1/images/bulk-delete (Eliminación masiva en lote)
  fastify.post(
    '/api/v1/images/bulk-delete',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: bulkDeleteImagesRouteSchema,
    },
    async (request, reply) => {
      const { ids } = request.body as { ids: string[] };
      const requester = await extractRequester(request);
      const result = await imagesBulkService.bulkDelete(ids, requester);
      return reply.send(result);
    }
  );

  // POST /api/v1/images/bulk-move (Movimiento masivo a otra carpeta)
  fastify.post(
    '/api/v1/images/bulk-move',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: bulkMoveImagesRouteSchema,
    },
    async (request, reply) => {
      const { ids, targetFolderId } = request.body as { ids: string[]; targetFolderId: string };
      const requester = await extractRequester(request);
      const result = await imagesBulkService.bulkMove(ids, targetFolderId, requester);
      return reply.send(result);
    }
  );
};
