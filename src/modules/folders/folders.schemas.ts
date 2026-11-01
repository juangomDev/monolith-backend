import type { FastifyRequest, FastifySchema } from 'fastify';
import { Role } from '@prisma/client';
import { prisma } from '../../config/db.js';
import {
  standardErrorResponses,
  securityDualAuth,
} from '../../shared/schemas.js';
import type { RequesterContext } from './folders.service.js';

export {
  moveImageToFolderRouteSchema,
  moveTableToFolderRouteSchema,
} from './folders.move.schemas.js';

export const passValidator = () => () => true;

export const folderItemSchema = {
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
    myPermission: { type: 'string', enum: ['ADMIN', 'EDIT', 'READ'], example: 'EDIT' },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'name', 'type', 'isPrivate', 'itemCount', 'userId', 'createdAt'],
};

export async function extractRequester(request: FastifyRequest): Promise<RequesterContext> {
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

export const listFoldersRouteSchema: FastifySchema = {
  tags: ['Folders'],
  summary: 'Listar carpetas respetando reglas de privacidad',
  description:
    'Retorna las carpetas visibles para el usuario. Usuarios comunes ven carpetas públicas y privadas propias; ADMIN ve todas. Permite filtrar con ?type=IMAGE|TABLE, buscar por texto con ?search y paginar con ?page y ?limit.',
  security: securityDualAuth,
  querystring: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['IMAGE', 'TABLE'],
        description: 'Filtrar por tipo de contenido',
      },
      search: {
        type: 'string',
        description: 'Búsqueda por nombre de carpeta (insensible a mayúsculas)',
      },
      page: {
        type: 'integer',
        minimum: 1,
        description: 'Número de página para paginación',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        description: 'Cantidad de carpetas por página',
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
        page: { type: 'integer', example: 1 },
        limit: { type: 'integer', example: 50 },
        totalPages: { type: 'integer', example: 1 },
        meta: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
            hasNext: { type: 'boolean' },
          },
        },
      },
      required: ['folders', 'total'],
    },
    401: standardErrorResponses[401],
  },
};

export const createFolderRouteSchema: FastifySchema = {
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
};

export const updateFolderRouteSchema: FastifySchema = {
  tags: ['Folders'],
  summary: 'Actualizar propiedades de una carpeta (renombrar, color o privacidad)',
  description:
    'Modifica el nombre, color identificador o visibilidad privada de una carpeta. Requiere ser el propietario o ADMIN. No se permite renombrar la carpeta del sistema General.',
  security: securityDualAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid', description: 'UUID de la carpeta' },
    },
  },
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 60, example: 'Galería Actualizada' },
      color: {
        type: 'string',
        nullable: true,
        pattern: '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$',
        example: '#10b981',
        description: 'Código hexadecimal del color de la carpeta o null para removerlo',
      },
      isPrivate: {
        type: 'boolean',
        example: true,
        description: 'Modificar visibilidad privada',
      },
    },
  },
  response: {
    200: {
      description: 'Carpeta actualizada exitosamente',
      type: 'object',
      properties: {
        folder: folderItemSchema,
      },
      required: ['folder'],
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};

export const getFolderByIdRouteSchema: FastifySchema = {
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
};

export const deleteFolderRouteSchema: FastifySchema = {
  tags: ['Folders'],
  summary: 'Eliminar carpeta en cascada física y lógica',
  description:
    'Elimina la carpeta de PostgreSQL y destruye físicamente en disco todos los archivos (imágenes o tablas) contenidos en ella. Requiere ser propietario o ADMIN. Prohibido eliminar la carpeta General.',
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
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};
