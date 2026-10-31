import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { FolderType, Role } from '@prisma/client';
import { foldersService, type RequesterContext } from './folders.service.js';
import { authenticateUserOrApiKey } from '../../gateway/auth.js';
import { prisma } from '../../config/db.js';
import {
  standardErrorResponses,
  securityDualAuth,
} from '../../shared/schemas.js';

const passValidator = () => () => true;

const folderItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'Proyectos 2026' },
    type: { type: 'string', enum: ['IMAGE', 'TABLE'] },
    color: { type: 'string', nullable: true, example: '#3b82f6' },
    isPrivate: { type: 'boolean', example: false },
    itemCount: { type: 'integer', example: 12 },
    userId: { type: 'string', format: 'uuid' },
    owner: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        username: { type: 'string', example: 'juan_perez' },
      },
    },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'name', 'type', 'isPrivate', 'itemCount', 'userId', 'createdAt'],
};

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
  fastify.get(
    '/api/v1/folders',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateUserOrApiKey],
      schema: {
        tags: ['Folders'],
        summary: 'Listar carpetas respetando reglas de privacidad',
        description:
          'Retorna las carpetas visibles para el usuario. Usuarios comunes ven carpetas públicas y privadas propias; ADMIN ve todas. Permite filtrar con ?type=IMAGE|TABLE.',
        security: securityDualAuth,
        querystring: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['IMAGE', 'TABLE'],
              description: 'Filtrar por tipo de contenido',
            },
          },
        },
        response: {
          200: {
            description: 'Listado de carpetas obtenido exitosamente',
            type: 'object',
            properties: {
              folders: {
                type: 'array',
                items: folderItemSchema,
              },
              total: { type: 'integer', example: 5 },
            },
            required: ['folders', 'total'],
          },
          401: standardErrorResponses[401],
        },
      },
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
      schema: {
        tags: ['Folders'],
        summary: 'Crear nueva carpeta de imágenes o tablas',
        description:
          'Registra una nueva carpeta asignada al usuario creador con su política de privacidad (pública o privada) y color identificador.',
        security: securityDualAuth,
        body: {
          type: 'object',
          required: ['name', 'type'],
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 60, example: 'Galería de Productos' },
            type: { type: 'string', enum: ['IMAGE', 'TABLE'], example: 'IMAGE' },
            color: {
              type: 'string',
              pattern: '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$',
              example: '#3b82f6',
              description: 'Código hexadecimal del color de la carpeta',
            },
            isPrivate: {
              type: 'boolean',
              default: false,
              description: 'Si es true, solo el creador y el ADMIN pueden ver y gestionar su contenido',
            },
          },
        },
        response: {
          201: {
            description: 'Carpeta creada exitosamente',
            type: 'object',
            properties: {
              folder: folderItemSchema,
            },
            required: ['folder'],
          },
          400: standardErrorResponses[400],
          401: standardErrorResponses[401],
        },
      },
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
      schema: {
        tags: ['Folders'],
        summary: 'Obtener detalle de una carpeta específica',
        description:
          'Devuelve la información de la carpeta. Si la carpeta es privada, solo su propietario o un ADMIN tienen autorización para consultarla.',
        security: securityDualAuth,
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'UUID de la carpeta' },
          },
        },
        response: {
          200: {
            description: 'Detalle de carpeta obtenido exitosamente',
            type: 'object',
            properties: {
              folder: folderItemSchema,
            },
            required: ['folder'],
          },
          401: standardErrorResponses[401],
          403: standardErrorResponses[403],
          404: standardErrorResponses[404],
        },
      },
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
      schema: {
        tags: ['Folders'],
        summary: 'Eliminar carpeta en cascada física y lógica',
        description:
          'Elimina la carpeta de PostgreSQL y destruye físicamente en disco todos los archivos (imágenes o tablas) contenidos en ella. Requiere ser propietario o ADMIN.',
        security: securityDualAuth,
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'UUID de la carpeta a eliminar' },
          },
        },
        response: {
          200: {
            description: 'Carpeta y archivos eliminados exitosamente',
            type: 'object',
            properties: {
              message: { type: 'string', example: 'Carpeta y archivos asociados eliminados exitosamente' },
              deletedCount: { type: 'integer', example: 3 },
            },
            required: ['message', 'deletedCount'],
          },
          401: standardErrorResponses[401],
          403: standardErrorResponses[403],
          404: standardErrorResponses[404],
        },
      },
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
      schema: {
        tags: ['Folders'],
        summary: 'Mover imagen a otra carpeta',
        description:
          'Reasigna una imagen a una carpeta de tipo IMAGE. Valida compatibilidad de tipo y permisos sobre la carpeta destino.',
        security: securityDualAuth,
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'UUID de la imagen' },
          },
        },
        body: {
          type: 'object',
          required: ['folderId'],
          properties: {
            folderId: { type: 'string', format: 'uuid', description: 'UUID de la carpeta destino de tipo IMAGE' },
          },
        },
        response: {
          200: {
            description: 'Imagen reasignada exitosamente',
            type: 'object',
            properties: {
              image: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  shortCode: { type: 'string', example: 'abc1234567' },
                  folderId: { type: 'string', format: 'uuid' },
                  originalName: { type: 'string' },
                  mimeType: { type: 'string' },
                  sizeBytes: { type: 'integer' },
                },
              },
            },
            required: ['image'],
          },
          400: standardErrorResponses[400],
          401: standardErrorResponses[401],
          403: standardErrorResponses[403],
          404: standardErrorResponses[404],
        },
      },
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
      schema: {
        tags: ['Folders'],
        summary: 'Mover tabla (dataset) a otra carpeta',
        description:
          'Reasigna una tabla a una carpeta de tipo TABLE. Valida compatibilidad de tipo y permisos sobre la carpeta destino.',
        security: securityDualAuth,
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'UUID de la tabla' },
          },
        },
        body: {
          type: 'object',
          required: ['folderId'],
          properties: {
            folderId: { type: 'string', format: 'uuid', description: 'UUID de la carpeta destino de tipo TABLE' },
          },
        },
        response: {
          200: {
            description: 'Tabla reasignada exitosamente',
            type: 'object',
            properties: {
              table: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  shortCode: { type: 'string', example: 'tab1234567' },
                  folderId: { type: 'string', format: 'uuid' },
                  tableName: { type: 'string' },
                  rowCount: { type: 'integer' },
                  sizeBytes: { type: 'integer' },
                },
              },
            },
            required: ['table'],
          },
          400: standardErrorResponses[400],
          401: standardErrorResponses[401],
          403: standardErrorResponses[403],
          404: standardErrorResponses[404],
        },
      },
    },
    async (request, reply) => {
      const requester = await extractRequester(request);
      const { id } = request.params as { id: string };

      const table = await foldersService.moveTableToFolder(id, request.body, requester);
      return reply.status(200).send({ table });
    }
  );
};
