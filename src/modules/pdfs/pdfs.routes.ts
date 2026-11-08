import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { Role } from '@prisma/client';
import { pdfsService } from './pdfs.service.js';
import { foldersMovementService } from '../folders/folders.movement.service.js';
import { authenticateUserOrApiKey } from '../../gateway/auth.js';
import { AppError } from '../../shared/errors.js';
import {
  passValidator,
  getPdfByShortCodeRouteSchema,
  listPdfsRouteSchema,
  uploadPdfRouteSchema,
  renamePdfRouteSchema,
  replacePdfRouteSchema,
  updatePdfMetadataRouteSchema,
  deletePdfRouteSchema,
  movePdfRouteSchema,
} from './pdfs.schemas.js';

function extractRequester(request: FastifyRequest): { id: string; role: Role } {
  if (request.user) {
    return { id: request.user.id, role: request.user.role };
  }
  return {
    id: request.apiClient?.id ?? '00000000-0000-0000-0000-000000000000',
    role: Role.ADMIN,
  };
}

export const pdfsRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Endpoint Público de Entrega (Capability URL)
  fastify.get(
    '/p/:short_code',
    {
      validatorCompiler: passValidator,
      schema: getPdfByShortCodeRouteSchema,
    },
    async (request, reply) => {
      const { short_code } = request.params as { short_code: string };
      const query = request.query as { download?: string; format?: string; page?: string };

      if (query?.format === 'text') {
        const artifact = await pdfsService.getPdfTextArtifact(short_code);
        if (query.page) {
          const pageNum = parseInt(query.page, 10);
          const pageItem = artifact.pages.find((p: any) => p.pageNumber === pageNum);
          if (!pageItem) throw new AppError(404, `Página ${pageNum} no encontrada`, 'PAGE_NOT_FOUND');
          return reply.send({ ...artifact, pages: [pageItem] });
        }
        return reply.send(artifact);
      }

      const { record, stream } = await pdfsService.getPdfDownload(short_code);
      const isDownload = query?.download === 'true';

      reply.header('Content-Type', 'application/pdf');
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      reply.header('Content-Security-Policy', 'sandbox');

      if (isDownload) {
        reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(record.originalName)}"`);
      } else {
        reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(record.originalName)}"`);
      }

      return reply.send(stream);
    }
  );

  // 2. Listado protegido de PDFs
  fastify.get(
    '/api/v1/pdfs',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: listPdfsRouteSchema,
    },
    async (request, reply) => {
      const caller = extractRequester(request);
      const query = request.query as any;
      const result = await pdfsService.listPdfs(
        {
          folderId: query.folderId,
          search: query.search,
          page: query.page ? parseInt(query.page, 10) : 1,
          limit: query.limit ? parseInt(query.limit, 10) : 50,
        },
        caller
      );
      return reply.send(result);
    }
  );

  // 3. Carga multipart de PDF
  fastify.post(
    '/api/v1/pdfs',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: uploadPdfRouteSchema,
    },
    async (request, reply) => {
      if (!request.isMultipart()) {
        throw new AppError(400, 'Debe adjuntar un archivo en el campo multipart', 'BAD_REQUEST');
      }

      const file = await request.file();
      if (!file) throw new AppError(400, 'Debe adjuntar un archivo PDF', 'BAD_REQUEST');

      const caller = extractRequester(request);
      const folderIdField = file.fields?.folderId as { value?: string } | undefined;
      const folderId = folderIdField?.value || (request.query as { folderId?: string })?.folderId;

      const buffer = await file.toBuffer();
      if (file.file.truncated) {
        throw new AppError(413, 'El archivo PDF supera el tamaño máximo permitido de 50MB', 'PAYLOAD_TOO_LARGE');
      }

      const record = await pdfsService.uploadPdf(buffer, file.filename, folderId, caller);
      return reply.status(201).send(record);
    }
  );

  // 4. Renombrar PDF
  fastify.patch(
    '/api/v1/pdfs/:id',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: renamePdfRouteSchema,
    },
    async (request, reply) => {
      const caller = extractRequester(request);
      const { id } = request.params as { id: string };
      const { originalName } = request.body as { originalName: string };
      const updated = await pdfsService.renamePdf(id, originalName, caller);
      return reply.send(updated);
    }
  );

  // 5. Reemplazo en Caliente (Hot-Swap)
  fastify.put(
    '/api/v1/pdfs/:id',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: replacePdfRouteSchema,
    },
    async (request, reply) => {
      if (!request.isMultipart()) {
        throw new AppError(400, 'Debe adjuntar un archivo en el campo multipart', 'BAD_REQUEST');
      }

      const file = await request.file();
      if (!file) throw new AppError(400, 'Debe adjuntar un archivo PDF para reemplazo', 'BAD_REQUEST');

      const caller = extractRequester(request);
      const { id } = request.params as { id: string };

      const buffer = await file.toBuffer();
      if (file.file.truncated) {
        throw new AppError(413, 'El archivo PDF supera el tamaño máximo permitido de 50MB', 'PAYLOAD_TOO_LARGE');
      }

      const updated = await pdfsService.replacePdf(id, buffer, file.filename, caller);
      return reply.send(updated);
    }
  );

  // 6. Actualizar Ficha Técnica (metadataCard)
  fastify.patch(
    '/api/v1/pdfs/:id/metadata',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: updatePdfMetadataRouteSchema,
    },
    async (request, reply) => {
      const caller = extractRequester(request);
      const { id } = request.params as { id: string };
      const updated = await pdfsService.updateMetadataCard(id, request.body, caller);
      return reply.send(updated);
    }
  );

  // 7. Eliminar PDF
  fastify.delete(
    '/api/v1/pdfs/:id',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: deletePdfRouteSchema,
    },
    async (request, reply) => {
      const caller = extractRequester(request);
      const { id } = request.params as { id: string };
      const result = await pdfsService.deletePdf(id, caller);
      return reply.send(result);
    }
  );

  // 8. Mover PDF a otra carpeta
  fastify.patch(
    '/api/v1/pdfs/:id/folder',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: movePdfRouteSchema,
    },
    async (request, reply) => {
      const caller = extractRequester(request);
      const { id } = request.params as { id: string };
      const updated = await foldersMovementService.movePdfToFolder(id, request.body, caller);
      return reply.send(updated);
    }
  );
};

