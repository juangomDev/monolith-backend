import type { FastifyPluginAsync } from 'fastify';
import { tablesService } from './tables.service.js';
import { authenticateUserOrApiKey } from '../../gateway/auth.js';
import { AppError } from '../../shared/errors.js';

export const tablesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /t/:short_code (Consulta paginada o descarga directa)
  fastify.get('/t/:short_code', async (request, reply) => {
    const { short_code } = request.params as { short_code: string };
    const query = request.query as { download?: string; page?: string; limit?: string };

    if (query?.download === 'true') {
      const { record, fileStream } = await tablesService.getTableDownloadStream(short_code);
      const isCsv = record.storagePath.toLowerCase().endsWith('.csv');
      const contentType = isCsv
        ? 'text/csv'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      reply.header('Content-Type', contentType);
      reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(record.tableName)}"`);
      return reply.send(fileStream);
    }

    const page = Math.max(1, parseInt(query?.page || '1', 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(query?.limit || '100', 10) || 100));

    const result = await tablesService.getTableDataPaginated(short_code, page, limit);
    return reply.send(result);
  });

  // GET /api/v1/tables (Listado protegido con Bearer JWT o X-API-Key)
  fastify.get('/api/v1/tables', { preHandler: [authenticateUserOrApiKey] }, async (request, reply) => {
    const requester = request.user ? { id: request.user.id, role: request.user.role } : undefined;
    const result = await tablesService.listTables(requester);
    return reply.send(result);
  });

  // POST /api/v1/tables (Subida protegida con Bearer JWT o X-API-Key)
  fastify.post('/api/v1/tables', { preHandler: [authenticateUserOrApiKey] }, async (request, reply) => {
    if (!request.isMultipart()) {
      throw new AppError(400, 'Debe adjuntar un archivo en el campo multipart', 'BAD_REQUEST');
    }

    const file = await request.file();
    if (!file) {
      throw new AppError(400, 'Debe adjuntar un archivo en el campo multipart', 'BAD_REQUEST');
    }

    const userId = request.user?.id;
    const folderIdField = file.fields?.folderId as { value?: string } | undefined;
    const folderId = folderIdField?.value || (request.query as { folderId?: string })?.folderId;

    const result = await tablesService.saveTable(file, folderId, userId);
    return reply.status(201).send(result);
  });

  // DELETE /api/v1/tables/:id (Eliminación protegida con Bearer JWT o X-API-Key)
  fastify.delete('/api/v1/tables/:id', { preHandler: [authenticateUserOrApiKey] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await tablesService.deleteTable(id);
    return reply.status(204).send();
  });
};
