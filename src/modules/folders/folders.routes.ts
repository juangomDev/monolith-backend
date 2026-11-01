import type { FastifyPluginAsync } from 'fastify';
import { FolderType } from '@prisma/client';
import { foldersService } from './folders.service.js';
import { authenticateUserOrApiKey } from '../../gateway/auth.js';
import {
  passValidator,
  extractRequester,
  listFoldersRouteSchema,
  createFolderRouteSchema,
  getFolderByIdRouteSchema,
  deleteFolderRouteSchema,
  moveImageToFolderRouteSchema,
  moveTableToFolderRouteSchema,
} from './folders.schemas.js';

export const foldersRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/folders: Listado de carpetas respetando privacidad
  fastify.get(
    '/api/v1/folders',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: listFoldersRouteSchema,
    },
    async (request, reply) => {
      const requester = await extractRequester(request);
      const { type } = request.query as { type?: FolderType };

      const result = await foldersService.listFolders(requester, type);
      return reply.status(200).send(result);
    }
  );

  // POST /api/v1/folders: Crear nueva carpeta
  fastify.post(
    '/api/v1/folders',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: createFolderRouteSchema,
    },
    async (request, reply) => {
      const requester = await extractRequester(request);
      const folder = await foldersService.createFolder(request.body, requester);
      return reply.status(201).send({ folder });
    }
  );

  // GET /api/v1/folders/:id: Detalle de carpeta
  fastify.get(
    '/api/v1/folders/:id',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: getFolderByIdRouteSchema,
    },
    async (request, reply) => {
      const requester = await extractRequester(request);
      const { id } = request.params as { id: string };

      const folder = await foldersService.getFolderById(id, requester);
      return reply.status(200).send({ folder });
    }
  );

  // DELETE /api/v1/folders/:id: Eliminación en cascada física y lógica
  fastify.delete(
    '/api/v1/folders/:id',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: deleteFolderRouteSchema,
    },
    async (request, reply) => {
      const requester = await extractRequester(request);
      const { id } = request.params as { id: string };

      const result = await foldersService.deleteFolder(id, requester);
      return reply.status(200).send(result);
    }
  );

  // PATCH /api/v1/images/:id/folder: Reasignar imagen a otra carpeta
  fastify.patch(
    '/api/v1/images/:id/folder',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: moveImageToFolderRouteSchema,
    },
    async (request, reply) => {
      const requester = await extractRequester(request);
      const { id } = request.params as { id: string };

      const image = await foldersService.moveImageToFolder(id, request.body, requester);
      return reply.status(200).send({ image });
    }
  );

  // PATCH /api/v1/tables/:id/folder: Reasignar tabla a otra carpeta
  fastify.patch(
    '/api/v1/tables/:id/folder',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: moveTableToFolderRouteSchema,
    },
    async (request, reply) => {
      const requester = await extractRequester(request);
      const { id } = request.params as { id: string };

      const table = await foldersService.moveTableToFolder(id, request.body, requester);
      return reply.status(200).send({ table });
    }
  );
};
