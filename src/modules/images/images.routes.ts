import type { FastifyPluginAsync } from 'fastify';
import { imagesService } from './images.service.js';
import { authenticateUserOrApiKey } from '../../gateway/auth.js';
import { AppError } from '../../shared/errors.js';
import {
  standardErrorResponses,
  securityDualAuth,
} from '../../shared/schemas.js';

const passValidator = () => () => true;

const imageItemSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string', format: 'uuid' },
    shortCode: { type: 'string', example: 'abc1234567' },
    originalName: { type: 'string', example: 'foto_paisaje.png' },
    mimeType: { type: 'string', example: 'image/png' },
    sizeBytes: { type: 'integer', example: 204850 },
    folderId: { type: 'string', format: 'uuid', nullable: true },
    url: { type: 'string', format: 'uri', example: 'http://localhost:3000/i/abc1234567' },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'shortCode', 'originalName', 'mimeType', 'sizeBytes', 'url'],
};

export const imagesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /i/:short_code (Entrega pública con cache agresiva e inmutable)
  fastify.get(
    '/i/:short_code',
    {
      validatorCompiler: passValidator,
      schema: {
        tags: ['Images'],
        summary: 'Entrega pública de imagen por shortCode (Capability URL)',
        description:
          'Sirve la imagen binaria directamente desde disco con cabeceras de caché inmutable (Cache-Control: public, max-age=31536000, immutable) optimizadas para etiquetas <img src="..."> y correos.',
        params: {
          type: 'object',
          required: ['short_code'],
          properties: {
            short_code: {
              type: 'string',
              minLength: 8,
              maxLength: 14,
              example: 'abc1234567',
              description: 'Código Base58 opaco de 10 caracteres',
            },
          },
        },
        response: {
          200: {
            description: 'Archivo binario de imagen',
            content: {
              'image/*': {
                schema: {
                  type: 'string',
                  format: 'binary',
                },
              },
            },
          },
          404: standardErrorResponses[404],
        },
      },
    },
    async (request, reply) => {
      const { short_code } = request.params as { short_code: string };
      const { record, fileStream } = await imagesService.getImageFileByShortCode(short_code);

      reply.header('Content-Type', record.mimeType);
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      return reply.send(fileStream);
    }
  );

  // GET /api/v1/images (Listado protegido con Bearer JWT o X-API-Key)
  fastify.get(
    '/api/v1/images',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: {
        tags: ['Images'],
        summary: 'Listar imágenes registradas',
        description:
          'Retorna el listado de imágenes registradas respetando las reglas de privacidad de las carpetas donde están alojadas.',
        security: securityDualAuth,
        response: {
          200: {
            description: 'Listado de imágenes obtenido exitosamente',
            type: 'object',
            additionalProperties: true,
            properties: {
              images: {
                type: 'array',
                items: imageItemSchema,
              },
              total: { type: 'integer', example: 1 },
            },
            required: ['images', 'total'],
          },
          401: standardErrorResponses[401],
        },
      },
    },
    async (request, reply) => {
      const requester = request.user ? { id: request.user.id, role: request.user.role } : undefined;
      const result = await imagesService.listImages(requester);
      return reply.send(result);
    }
  );

  // POST /api/v1/images (Subida protegida con Bearer JWT o X-API-Key)
  fastify.post(
    '/api/v1/images',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: {
        tags: ['Images'],
        summary: 'Subir y procesar nueva imagen',
        description:
          'Ingesta de imagen multipart/form-data. Valida magic bytes (JPEG, PNG, WebP) e inspecta límites de 50MB. Asigna a carpeta General si folderId no es provisto.',
        security: securityDualAuth,
        consumes: ['multipart/form-data'],
        response: {
          201: {
            description: 'Imagen subida y registrada exitosamente',
            type: 'object',
            additionalProperties: true,
            properties: {
              id: { type: 'string', format: 'uuid' },
              shortCode: { type: 'string', example: 'abc1234567' },
              url: { type: 'string', format: 'uri', example: 'http://localhost:3000/i/abc1234567' },
              originalName: { type: 'string', example: 'foto.png' },
              mimeType: { type: 'string', example: 'image/png' },
              sizeBytes: { type: 'integer', example: 1048576 },
              folderId: { type: 'string', format: 'uuid', nullable: true },
            },
            required: ['id', 'shortCode', 'url', 'originalName', 'mimeType', 'sizeBytes'],
          },
          400: standardErrorResponses[400],
          401: standardErrorResponses[401],
          413: standardErrorResponses[413],
          415: standardErrorResponses[415],
        },
      },
    },
    async (request, reply) => {
      if (!request.isMultipart()) {
        throw new AppError(400, 'Debe adjuntar un archivo de imagen en el campo multipart', 'BAD_REQUEST');
      }

      const file = await request.file();
      if (!file) {
        throw new AppError(400, 'Debe adjuntar un archivo de imagen en el campo multipart', 'BAD_REQUEST');
      }

      const userId = request.user?.id;
      const folderIdField = file.fields?.folderId as { value?: string } | undefined;
      const folderId = folderIdField?.value || (request.query as { folderId?: string })?.folderId;

      const result = await imagesService.saveImage(file, folderId, userId);
      return reply.status(201).send(result);
    }
  );

  // DELETE /api/v1/images/:id (Eliminación protegida con Bearer JWT o X-API-Key)
  fastify.delete(
    '/api/v1/images/:id',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: {
        tags: ['Images'],
        summary: 'Eliminar imagen física y lógicamente',
        description: 'Elimina el registro de la imagen en base de datos PostgreSQL y destruye su archivo binario en disco.',
        security: securityDualAuth,
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'UUID de la imagen a eliminar' },
          },
        },
        response: {
          204: {
            description: 'Imagen eliminada exitosamente (sin contenido)',
            type: 'null',
          },
          401: standardErrorResponses[401],
          404: standardErrorResponses[404],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await imagesService.deleteImage(id);
      return reply.status(204).send();
    }
  );
};
