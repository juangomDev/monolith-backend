import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { FolderType, Role } from '@prisma/client';
import { foldersService, type RequesterContext } from './folders.service.js';
import { authenticateUserOrApiKey } from '../../gateway/auth.js';
import { prisma } from '../../config/db.js';

async function extractRequester(request: FastifyRequest): Promise<RequesterContext> {
  if (request.user) {
    return { id: request.user.id, role: request.user.role };
  }

  // Clientes autenticados mediante X-API-Key operan con permisos administrativos
  const admin = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
  return {
    id: admin ? admin.id : (request.apiClient?.id ?? '00000000-0000-0000-0000-000000000000'),
    role: Role.ADMIN,
  };
}

export const foldersRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/folders: Listado de carpetas respetando privacidad
  fastify.get('/api/v1/folders', { preHandler: [authenticateUserOrApiKey] }, async (request, reply) => {
    const requester = await extractRequester(request);
    const { type } = request.query as { type?: FolderType };

    const result = await foldersService.listFolders(requester, type);
    return reply.status(200).send(result);
  });

  // POST /api/v1/folders: Crear nueva carpeta
  fastify.post('/api/v1/folders', { preHandler: [authenticateUserOrApiKey] }, async (request, reply) => {
    const requester = await extractRequester(request);
    const folder = await foldersService.createFolder(request.body, requester);
    return reply.status(201).send({ folder });
  });

  // GET /api/v1/folders/:id: Detalle de carpeta
  fastify.get('/api/v1/folders/:id', { preHandler: [authenticateUserOrApiKey] }, async (request, reply) => {
    const requester = await extractRequester(request);
    const { id } = request.params as { id: string };

    const folder = await foldersService.getFolderById(id, requester);
    return reply.status(200).send({ folder });
  });

  // DELETE /api/v1/folders/:id: Eliminación en cascada física y lógica
  fastify.delete('/api/v1/folders/:id', { preHandler: [authenticateUserOrApiKey] }, async (request, reply) => {
    const requester = await extractRequester(request);
    const { id } = request.params as { id: string };

    const result = await foldersService.deleteFolder(id, requester);
    return reply.status(200).send(result);
  });

  // PATCH /api/v1/images/:id/folder: Reasignar imagen a otra carpeta
  fastify.patch('/api/v1/images/:id/folder', { preHandler: [authenticateUserOrApiKey] }, async (request, reply) => {
    const requester = await extractRequester(request);
    const { id } = request.params as { id: string };

    const image = await foldersService.moveImageToFolder(id, request.body, requester);
    return reply.status(200).send({ image });
  });

  // PATCH /api/v1/tables/:id/folder: Reasignar tabla a otra carpeta
  fastify.patch('/api/v1/tables/:id/folder', { preHandler: [authenticateUserOrApiKey] }, async (request, reply) => {
    const requester = await extractRequester(request);
    const { id } = request.params as { id: string };

    const table = await foldersService.moveTableToFolder(id, request.body, requester);
    return reply.status(200).send({ table });
  });
};
