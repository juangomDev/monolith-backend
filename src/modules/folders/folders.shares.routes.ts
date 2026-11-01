import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { FolderPermission } from '@prisma/client';
import { foldersSharesService } from './folders.shares.service.js';
import { authenticateJwt } from '../../gateway/auth.js';
import { AppError } from '../../shared/errors.js';
import { passValidator } from '../users/users.schemas.js';
import { standardErrorResponses, securityBearerAuth } from '../../shared/schemas.js';

const shareBodySchema = z.object({
  userId: z.string().uuid('El userId debe ser un UUID válido'),
  permission: z.enum(['READ', 'EDIT']).optional().default('READ'),
});

const updateShareBodySchema = z.object({
  permission: z.enum(['READ', 'EDIT']),
});

export const foldersSharesRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/folders/:id/shares (Asignar colaborador)
  fastify.post(
    '/api/v1/folders/:id/shares',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateJwt],
      schema: {
        tags: ['Folders'],
        summary: 'Compartir carpeta con un usuario colaborador',
        security: securityBearerAuth,
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
        body: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', format: 'uuid' },
            permission: { type: 'string', enum: ['READ', 'EDIT'], default: 'READ' },
          },
        },
        response: {
          201: {
            description: 'Carpeta compartida exitosamente',
            type: 'object',
            properties: {
              share: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  folderId: { type: 'string', format: 'uuid' },
                  userId: { type: 'string', format: 'uuid' },
                  permission: { type: 'string', enum: ['READ', 'EDIT'] },
                  createdAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            required: ['share'],
          },
          400: standardErrorResponses[400],
          401: standardErrorResponses[401],
          403: standardErrorResponses[403],
          404: standardErrorResponses[404],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = shareBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new AppError(400, parseResult.error.issues[0]?.message || 'Datos de compartición inválidos', 'BAD_REQUEST');
      }

      const share = await foldersSharesService.shareFolder(
        id,
        request.user,
        parseResult.data.userId,
        parseResult.data.permission as FolderPermission
      );
      return reply.status(201).send({ share });
    }
  );

  // GET /api/v1/folders/:id/shares (Listar colaboradores)
  fastify.get(
    '/api/v1/folders/:id/shares',
    {
      preHandler: [authenticateJwt],
      schema: {
        tags: ['Folders'],
        summary: 'Listar colaboradores de una carpeta',
        security: securityBearerAuth,
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
        response: {
          200: {
            description: 'Listado de colaboradores',
            type: 'object',
            properties: {
              shares: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    folderId: { type: 'string', format: 'uuid' },
                    userId: { type: 'string', format: 'uuid' },
                    permission: { type: 'string', enum: ['READ', 'EDIT'] },
                    createdAt: { type: 'string', format: 'date-time' },
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        username: { type: 'string' },
                        role: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
            required: ['shares'],
          },
          401: standardErrorResponses[401],
          403: standardErrorResponses[403],
          404: standardErrorResponses[404],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const shares = await foldersSharesService.listShares(id, request.user);
      return reply.status(200).send({ shares });
    }
  );

  // PATCH /api/v1/folders/:id/shares/:userId (Modificar permiso)
  fastify.patch(
    '/api/v1/folders/:id/shares/:userId',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateJwt],
      schema: {
        tags: ['Folders'],
        summary: 'Modificar nivel de permiso de un colaborador en la carpeta',
        security: securityBearerAuth,
        params: {
          type: 'object',
          required: ['id', 'userId'],
          properties: { id: { type: 'string', format: 'uuid' }, userId: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['permission'],
          properties: { permission: { type: 'string', enum: ['READ', 'EDIT'] } },
        },
        response: {
          200: {
            description: 'Permiso actualizado',
            type: 'object',
            properties: {
              share: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  folderId: { type: 'string', format: 'uuid' },
                  userId: { type: 'string', format: 'uuid' },
                  permission: { type: 'string', enum: ['READ', 'EDIT'] },
                },
              },
            },
            required: ['share'],
          },
          400: standardErrorResponses[400],
          401: standardErrorResponses[401],
          403: standardErrorResponses[403],
          404: standardErrorResponses[404],
        },
      },
    },
    async (request, reply) => {
      const { id, userId } = request.params as { id: string; userId: string };
      const parseResult = updateShareBodySchema.safeParse(request.body);
      if (!parseResult.success) throw new AppError(400, 'Permiso requerido (READ o EDIT)', 'BAD_REQUEST');

      const share = await foldersSharesService.updateSharePermission(
        id,
        request.user,
        userId,
        parseResult.data.permission as FolderPermission
      );
      return reply.status(200).send({ share });
    }
  );

  // DELETE /api/v1/folders/:id/shares/:userId (Revocar colaborador)
  fastify.delete(
    '/api/v1/folders/:id/shares/:userId',
    {
      preHandler: [authenticateJwt],
      schema: {
        tags: ['Folders'],
        summary: 'Revocar acceso de un colaborador a la carpeta',
        security: securityBearerAuth,
        params: {
          type: 'object',
          required: ['id', 'userId'],
          properties: { id: { type: 'string', format: 'uuid' }, userId: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: {
            description: 'Acceso revocado exitosamente',
            type: 'object',
            properties: { revoked: { type: 'boolean' } },
            required: ['revoked'],
          },
          401: standardErrorResponses[401],
          403: standardErrorResponses[403],
          404: standardErrorResponses[404],
        },
      },
    },
    async (request, reply) => {
      const { id, userId } = request.params as { id: string; userId: string };
      const result = await foldersSharesService.revokeShare(id, request.user, userId);
      return reply.status(200).send(result);
    }
  );
};
