import type { FastifyPluginAsync } from 'fastify';
import { tablesService } from './tables.service.js';
import { authenticateUserOrApiKey } from '../../gateway/auth.js';
import { AppError } from '../../shared/errors.js';
import {
  standardErrorResponses,
  securityDualAuth,
} from '../../shared/schemas.js';

const passValidator = () => () => true;

const tableItemSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string', format: 'uuid' },
    shortCode: { type: 'string', example: 'tab1234567' },
    tableName: { type: 'string', example: 'ventas_2026.csv' },
    rowCount: { type: 'integer', example: 1500 },
    columns: {
      type: 'array',
      items: { type: 'string' },
      example: ['id', 'producto', 'precio', 'fecha'],
    },
    columnsSchema: {
      type: 'array',
      items: { type: 'string' },
    },
    sizeBytes: { type: 'integer', example: 51200 },
    folderId: { type: 'string', format: 'uuid', nullable: true },
    url: { type: 'string', format: 'uri', example: 'http://localhost:3000/t/tab1234567' },
    downloadUrl: { type: 'string', format: 'uri', example: 'http://localhost:3000/t/tab1234567?download=true' },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'shortCode', 'tableName', 'rowCount', 'sizeBytes'],
};

export const tablesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /t/:short_code (Consulta paginada o descarga directa)
  fastify.get(
    '/t/:short_code',
    {
      validatorCompiler: passValidator,
      schema: {
        tags: ['Tables'],
        summary: 'Consulta JSON paginada o descarga de dataset por shortCode',
        description:
          'Si incluye query param ?download=true, descarga directamente el archivo original (.csv o .xlsx). De lo contrario, entrega los datos en formato JSON paginado con esquema de columnas y metadatos.',
        params: {
          type: 'object',
          required: ['short_code'],
          properties: {
            short_code: {
              type: 'string',
              minLength: 8,
              maxLength: 14,
              example: 'tab1234567',
              description: 'Código Base58 opaco de 10 caracteres',
            },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            download: { type: 'string', enum: ['true', 'false'], description: 'Descargar archivo original' },
            page: { type: 'integer', default: 1, description: 'Número de página a consultar' },
            limit: { type: 'integer', default: 100, maximum: 500, description: 'Registros por página (máx 500)' },
          },
        },
        response: {
          200: {
            description: 'Datos paginados o stream de descarga de dataset',
            type: 'object',
            additionalProperties: true,
            properties: {
              id: { type: 'string' },
              shortCode: { type: 'string' },
              tableName: { type: 'string' },
              columns: { type: 'array', items: { type: 'string' } },
              data: {
                type: 'array',
                items: { type: 'object', additionalProperties: true },
              },
              meta: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  page: { type: 'integer' },
                  limit: { type: 'integer' },
                  total: { type: 'integer' },
                  totalPages: { type: 'integer' },
                  hasNext: { type: 'boolean' },
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
    }
  );

  // GET /api/v1/tables (Listado protegido con Bearer JWT o X-API-Key)
  fastify.get(
    '/api/v1/tables',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: {
        tags: ['Tables'],
        summary: 'Listar datasets tabulares registrados',
        description: 'Retorna el listado de tablas respetando las reglas de privacidad de las carpetas contenedoras.',
        security: securityDualAuth,
        response: {
          200: {
            description: 'Listado de tablas obtenido exitosamente',
            type: 'object',
            additionalProperties: true,
            properties: {
              tables: {
                type: 'array',
                items: tableItemSchema,
              },
              total: { type: 'integer', example: 1 },
            },
            required: ['tables', 'total'],
          },
          401: standardErrorResponses[401],
        },
      },
    },
    async (request, reply) => {
      const requester = request.user ? { id: request.user.id, role: request.user.role } : undefined;
      const result = await tablesService.listTables(requester);
      return reply.send(result);
    }
  );

  // POST /api/v1/tables (Subida protegida con Bearer JWT o X-API-Key)
  fastify.post(
    '/api/v1/tables',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: {
        tags: ['Tables'],
        summary: 'Subir y procesar dataset tabular (CSV o Excel)',
        description:
          'Ingesta multipart/form-data de archivos CSV o XLSX. Inspecciona cabeceras para deducir columnas y total de filas. Se asigna a General si no se provee folderId.',
        security: securityDualAuth,
        consumes: ['multipart/form-data'],
        response: {
          201: {
            description: 'Dataset subido y procesado exitosamente',
            type: 'object',
            additionalProperties: true,
            properties: {
              id: { type: 'string', format: 'uuid' },
              shortCode: { type: 'string', example: 'tab1234567' },
              url: { type: 'string', format: 'uri' },
              tableName: { type: 'string', example: 'datos.csv' },
              rowCount: { type: 'integer', example: 100 },
              columns: { type: 'array', items: { type: 'string' } },
              sizeBytes: { type: 'integer' },
              folderId: { type: 'string', format: 'uuid', nullable: true },
            },
            required: ['id', 'shortCode', 'url', 'tableName', 'rowCount', 'sizeBytes'],
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
    }
  );

  // DELETE /api/v1/tables/:id (Eliminación protegida con Bearer JWT o X-API-Key)
  fastify.delete(
    '/api/v1/tables/:id',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: {
        tags: ['Tables'],
        summary: 'Eliminar dataset física y lógicamente',
        description: 'Elimina el registro de la tabla en base de datos PostgreSQL y destruye su archivo binario en disco.',
        security: securityDualAuth,
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'UUID de la tabla a eliminar' },
          },
        },
        response: {
          204: {
            description: 'Dataset eliminado exitosamente (sin contenido)',
            type: 'null',
          },
          401: standardErrorResponses[401],
          404: standardErrorResponses[404],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await tablesService.deleteTable(id);
      return reply.status(204).send();
    }
  );
};
