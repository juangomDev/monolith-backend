import type { FastifyPluginAsync } from 'fastify';
import { tablesService } from './tables.service.js';
import { tablesMetadataService } from './tables.metadata.service.js';
import { tablesMutationService } from './tables.mutation.service.js';
import { tablesBulkService } from './tables.bulk.service.js';
import { authenticateUserOrApiKey } from '../../gateway/auth.js';
import { AppError } from '../../shared/errors.js';
import {
  passValidator,
  getTableByShortCodeRouteSchema,
  listTablesRouteSchema,
  uploadTableRouteSchema,
  updateTableMetadataRouteSchema,
  deleteTableRouteSchema,
  extractRequester,
} from './tables.schemas.js';
import { renameTableRouteSchema, replaceTableRouteSchema } from './tables.mutation.schemas.js';
import { bulkDeleteTablesRouteSchema, bulkMoveTablesRouteSchema } from './tables.bulk.schemas.js';

export const tablesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /t/:short_code (Consulta paginada o descarga directa)
  fastify.get(
    '/t/:short_code',
    {
      validatorCompiler: passValidator,
      schema: getTableByShortCodeRouteSchema,
    },
    async (request, reply) => {
      const { short_code } = request.params as { short_code: string };
      const query = request.query as { download?: string; page?: string; limit?: string; raw?: string };

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

      const isPaginated = query?.page !== undefined || query?.limit !== undefined;
      const acceptsGzip = Boolean(request.headers['accept-encoding']?.includes('gzip'));

      // Entrega instantánea de artefacto precalculado (2 ms) si se pide raw o si el cliente acepta gzip sin paginar
      if (query?.raw === 'true' || (acceptsGzip && !isPaginated)) {
        const precalc = await tablesService.getPrecalculatedGzipStream(short_code);
        if (precalc) {
          reply.header('Content-Type', 'application/json');
          reply.header('Content-Encoding', 'gzip');
          reply.header('Cache-Control', 'public, max-age=31536000, immutable');
          return reply.send(precalc.stream);
        }
      }

      const page = Math.max(1, parseInt(query?.page || '1', 10) || 1);
      const limit = Math.min(500, Math.max(1, parseInt(query?.limit || '100', 10) || 100));

      const result = await tablesService.getTableDataPaginated(short_code, page, limit);
      return reply.send(result);
    }
  );

  // GET /api/v1/tables (Listado protegido con Bearer JWT o X-API-Key)
  fastify.get(
    '/api/v1/tables',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: listTablesRouteSchema,
    },
    async (request, reply) => {
      const requester = request.user ? { id: request.user.id, role: request.user.role } : undefined;
      const query = request.query as { page?: string; limit?: string; folderId?: string; search?: string };
      const page = query?.page ? parseInt(query.page, 10) : undefined;
      const limit = query?.limit ? parseInt(query.limit, 10) : undefined;
      const folderId = query?.folderId;
      const search = query?.search ? query.search.trim() : undefined;

      const result = await tablesService.listTables({ page, limit, folderId, requester, search });
      return reply.send(result);
    }
  );

  // POST /api/v1/tables (Subida protegida con Bearer JWT o X-API-Key)
  fastify.post(
    '/api/v1/tables',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: uploadTableRouteSchema,
    },
    async (request, reply) => {
      if (!request.isMultipart()) {
        throw new AppError(400, 'Debe adjuntar un archivo en el campo multipart', 'BAD_REQUEST');
      }

      const file = await request.file();
      if (!file) {
        throw new AppError(400, 'Debe adjuntar un archivo en el campo multipart', 'BAD_REQUEST');
      }

      const requester = extractRequester(request);
      const folderIdField = file.fields?.folderId as { value?: string } | undefined;
      const folderId = folderIdField?.value || (request.query as { folderId?: string })?.folderId;

      const result = await tablesService.saveTable(file, folderId, requester);
      return reply.status(201).send(result);
    }
  );

  // PATCH /api/v1/tables/:id/metadata (Actualización de Ficha Técnica)
  fastify.patch(
    '/api/v1/tables/:id/metadata',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: updateTableMetadataRouteSchema,
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const requester = extractRequester(request);
      const result = await tablesMetadataService.updateMetadata(id, request.body, requester);
      return reply.send(result);
    }
  );

  // DELETE /api/v1/tables/:id (Eliminación protegida con Bearer JWT o X-API-Key)
  fastify.delete(
    '/api/v1/tables/:id',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: deleteTableRouteSchema,
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const requester = extractRequester(request);
      await tablesService.deleteTable(id, requester);
      return reply.status(204).send();
    }
  );

  // PATCH /api/v1/tables/:id (Renombrar dataset)
  fastify.patch(
    '/api/v1/tables/:id',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: renameTableRouteSchema,
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { tableName } = request.body as { tableName: string };
      const requester = extractRequester(request);
      const result = await tablesMutationService.renameTable(id, tableName, requester);
      return reply.send(result);
    }
  );

  // PUT /api/v1/tables/:id (Reemplazo en caliente - Hot-Swap)
  fastify.put(
    '/api/v1/tables/:id',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: replaceTableRouteSchema,
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const requester = extractRequester(request);
      if (!request.isMultipart()) {
        throw new AppError(400, 'Debe adjuntar un archivo en el campo multipart', 'BAD_REQUEST');
      }
      const file = await request.file();
      if (!file) {
        throw new AppError(400, 'No se recibió ningún archivo para el reemplazo', 'BAD_REQUEST');
      }
      const result = await tablesMutationService.replaceTableFile(id, file, requester);
      return reply.send(result);
    }
  );

  // POST /api/v1/tables/bulk-delete (Eliminación masiva en lote)
  fastify.post(
    '/api/v1/tables/bulk-delete',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: bulkDeleteTablesRouteSchema,
    },
    async (request, reply) => {
      const { ids } = request.body as { ids: string[] };
      const requester = extractRequester(request);
      const result = await tablesBulkService.bulkDelete(ids, requester);
      return reply.send(result);
    }
  );

  // POST /api/v1/tables/bulk-move (Movimiento masivo a otra carpeta)
  fastify.post(
    '/api/v1/tables/bulk-move',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: bulkMoveTablesRouteSchema,
    },
    async (request, reply) => {
      const { ids, targetFolderId } = request.body as { ids: string[]; targetFolderId: string };
      const requester = extractRequester(request);
      const result = await tablesBulkService.bulkMove(ids, targetFolderId, requester);
      return reply.send(result);
    }
  );
};
