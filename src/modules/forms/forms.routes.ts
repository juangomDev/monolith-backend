import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { Role } from '@prisma/client';
import { formsService } from './forms.service.js';
import { authenticateUserOrApiKey } from '../../gateway/auth.js';
import {
  passValidator,
  createFormRouteSchema,
  listFormsRouteSchema,
  getFormRouteSchema,
  submitEntryRouteSchema,
  resolveEntryRouteSchema,
  dispatchEntryRouteSchema,
  listEntriesRouteSchema,
  exportEntriesRouteSchema,
} from './forms.schemas.js';

function extractRequester(request: FastifyRequest): { id: string; role: Role } {
  if (request.user) {
    return { id: request.user.id, role: request.user.role };
  }
  return {
    id: request.apiClient?.id ?? '00000000-0000-0000-0000-000000000000',
    role: Role.ADMIN,
  };
}

export const formsRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Endpoint Público (Endpoint 1): Envío de formulario
  fastify.post(
    '/api/v1/public/forms/:slug/entries',
    {
      validatorCompiler: passValidator,
      schema: submitEntryRouteSchema,
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const ip = request.ip || (request.headers['x-forwarded-for'] as string);
      const result = await formsService.submitEntry(slug, request.body, ip);
      return reply.code(201).send(result);
    }
  );

  // 2. Crear formulario (Protegido)
  fastify.post(
    '/api/v1/forms',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: createFormRouteSchema,
    },
    async (request, reply) => {
      const caller = extractRequester(request);
      const form = await formsService.createForm(request.body as any, caller);
      return reply.code(201).send(form);
    }
  );

  // 3. Listar formularios (Protegido)
  fastify.get(
    '/api/v1/forms',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: listFormsRouteSchema,
    },
    async (request, reply) => {
      const caller = extractRequester(request);
      const query = request.query as any;
      const forms = await formsService.listForms(
        {
          folderId: query.folderId,
          search: query.search,
          page: query.page ? parseInt(query.page, 10) : 1,
          limit: query.limit ? parseInt(query.limit, 10) : 50,
        },
        caller
      );
      return reply.send({ forms });
    }
  );

  // 4. Detalle de formulario por ID o Slug (Protegido)
  fastify.get(
    '/api/v1/forms/:id',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: getFormRouteSchema,
    },
    async (request, reply) => {
      const caller = extractRequester(request);
      const { id } = request.params as { id: string };
      const form = await formsService.getForm(id, caller);
      return reply.send(form);
    }
  );

  // 5. Endpoint de Resolución Única (Endpoint 2 - Write-Once)
  fastify.patch(
    '/api/v1/forms/entries/:id/resolve',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: resolveEntryRouteSchema,
    },
    async (request, reply) => {
      const caller = extractRequester(request);
      const { id } = request.params as { id: string };
      const ip = request.ip || (request.headers['x-forwarded-for'] as string);
      const updated = await formsService.resolveEntry(id, request.body as any, caller, ip);
      return reply.send(updated);
    }
  );

  // 6. Reenvío bajo demanda al sistema externo de PDFs (Sin tocar disco)
  fastify.post(
    '/api/v1/forms/entries/:id/dispatch',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: dispatchEntryRouteSchema,
    },
    async (request, reply) => {
      const caller = extractRequester(request);
      const { id } = request.params as { id: string };
      const result = await formsService.dispatchEntry(id, caller);
      return reply.send(result);
    }
  );

  // 7. Listar entradas de un formulario (Protegido)
  fastify.get(
    '/api/v1/forms/:id/entries',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: listEntriesRouteSchema,
    },
    async (request, reply) => {
      const caller = extractRequester(request);
      const { id } = request.params as { id: string };
      const query = request.query as any;
      const result = await formsService.listEntries(
        id,
        {
          month: query.month,
          status: query.status,
          page: query.page ? parseInt(query.page, 10) : 1,
          limit: query.limit ? parseInt(query.limit, 10) : 50,
        },
        caller
      );
      return reply.send(result);
    }
  );

  // 8. Exportar entradas a Excel o CSV (Protegido)
  fastify.get(
    '/api/v1/forms/:id/export',
    {
      preHandler: [authenticateUserOrApiKey],
      validatorCompiler: passValidator,
      schema: exportEntriesRouteSchema,
    },
    async (request, reply) => {
      const caller = extractRequester(request);
      const { id } = request.params as { id: string };
      const query = request.query as any;
      const { buffer, contentType, filename } = await formsService.exportEntries(
        id,
        {
          month: query.month,
          status: query.status,
          format: query.format,
        },
        caller
      );

      reply.header('Content-Type', contentType);
      reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      return reply.send(buffer);
    }
  );
};

